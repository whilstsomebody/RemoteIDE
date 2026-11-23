import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { RedisService } from "../src/services/redis.service.js";
import { KafkaService } from "../src/services/kafka.service.js";
import { OutboxService } from "../src/services/outbox.service.js";
import { SyncService } from "../src/services/sync.service.js";
import { TunnelRelayService } from "../src/services/tunnel-relay.service.js";
import { WorkspaceEventType, createDurableEvent, REDIS_CHANNELS } from "@remote-ide/shared";

describe("Phase 6 — Distributed Event Infrastructure & Synchronization", () => {
  let app: FastifyInstance;
  let redis: RedisService;
  let kafka: KafkaService;
  let outbox: OutboxService;
  let relay: TunnelRelayService;
  let sync: SyncService;

  beforeEach(async () => {
    redis = new RedisService({ lazyConnect: true, enableFallback: true });
    kafka = new KafkaService({ enableFallback: true });
    outbox = new OutboxService({ redis, kafka });
    relay = new TunnelRelayService();
    sync = new SyncService({ outbox, redis, kafka, relay });

    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    outbox.stop();
    await redis.close();
    await kafka.close();
    await app.close();
  });

  it("delivers workspace file modification events to multiple connected devices", async () => {
    const wsClientA = {
      // WebSocket.OPEN
      readyState: 1,
      send: vi.fn(),
      on: vi.fn(),
    } as any;

    const wsClientB = {
      readyState: 1,
      send: vi.fn(),
      on: vi.fn(),
    } as any;

    relay.registerClientSocket("session_devA", wsClientA, {
      allowedWorkspaceIds: ["ws_project_1"],
      role: "developer",
    });

    relay.registerClientSocket("session_devB", wsClientB, {
      allowedWorkspaceIds: ["ws_project_1"],
      role: "viewer",
    });

    const event = await outbox.recordWorkspaceEvent({
      workspaceId: "ws_project_1",
      hostId: "host_mac",
      eventType: WorkspaceEventType.FILE_UPDATED,
      actorId: "user_a",
      payload: { path: "src/main.ts", size: 1024 },
    });

    relay.broadcastWorkspaceEvent("ws_project_1", event);

    expect(wsClientA.send).toHaveBeenCalledTimes(1);
    expect(wsClientB.send).toHaveBeenCalledTimes(1);

    const receivedA = JSON.parse(wsClientA.send.mock.calls[0][0]);
    const receivedB = JSON.parse(wsClientB.send.mock.calls[0][0]);

    expect(receivedA.payload.id).toBe(event.id);
    expect(receivedB.payload.id).toBe(event.id);
    expect(receivedA.payload.revision).toBe(1);
    expect(receivedB.payload.revision).toBe(1);
  });

  it("processes external host filesystem changes and notifies clients", async () => {
    const wsClient = {
      readyState: 1,
      send: vi.fn(),
      on: vi.fn(),
    } as any;

    relay.registerClientSocket("session_live", wsClient, {
      allowedWorkspaceIds: ["ws_main"],
      role: "owner",
    });

    const res = await sync.syncAgentEvents("host_linux", [
      {
        eventId: "fsev_ext_001",
        sequenceNumber: 101,
        workspaceId: "ws_main",
        type: WorkspaceEventType.FILE_CREATED,
        operationType: "create",
        relativePath: "README.md",
        payload: { source: "external_watcher" },
        timestamp: new Date().toISOString(),
      },
    ]);

    expect(res.acceptedEventIds).toContain("fsev_ext_001");
    expect(res.latestRevisions["ws_main"]).toBe(1);

    const reconcile = await sync.reconcileClient("ws_main", 0);
    expect(reconcile.events.length).toBe(1);
    expect((reconcile.events[0] as any).id).toBe("fsev_ext_001");
  });

  it("allocates monotonically increasing, authoritative revisions for concurrent modifications", async () => {
    const p1 = outbox.recordWorkspaceEvent({
      workspaceId: "ws_concurrency",
      hostId: "host_1",
      eventType: WorkspaceEventType.FILE_UPDATED,
      actorId: "actor_1",
      payload: { path: "file1.ts" },
    });

    const p2 = outbox.recordWorkspaceEvent({
      workspaceId: "ws_concurrency",
      hostId: "host_1",
      eventType: WorkspaceEventType.FILE_UPDATED,
      actorId: "actor_2",
      payload: { path: "file2.ts" },
    });

    const p3 = outbox.recordWorkspaceEvent({
      workspaceId: "ws_concurrency",
      hostId: "host_1",
      eventType: WorkspaceEventType.FILE_UPDATED,
      actorId: "actor_3",
      payload: { path: "file3.ts" },
    });

    const [ev1, ev2, ev3] = await Promise.all([p1, p2, p3]);

    const revisions = [ev1.revision, ev2.revision, ev3.revision].sort((a, b) => a! - b!);
    expect(revisions).toEqual([1, 2, 3]);

    const cachedRev = await redis.getCachedWorkspaceRevision("ws_concurrency");
    expect(cachedRev).toBe(3);
  });

  it("continues operating smoothly with in-memory fallback during Redis outages", async () => {
    await redis.cacheSession({
      id: "sess_offline_test",
      userId: "u1",
      hostId: "h1",
      role: "developer" as any,
      capabilities: [] as any,
      allowedWorkspaceIds: ["ws_1"],
      deviceName: "MacBook",
      ipAddress: "127.0.0.1",
      userAgent: "Agent",
      isOwner: false,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      isRevoked: false,
    });

    const cached = await redis.getCachedSession("sess_offline_test");
    expect(cached).not.toBeNull();
    expect(cached?.id).toBe("sess_offline_test");

    const rl1 = await redis.checkRateLimit("user:101", 3, 60);
    const rl2 = await redis.checkRateLimit("user:101", 3, 60);
    const rl3 = await redis.checkRateLimit("user:101", 3, 60);
    const rl4 = await redis.checkRateLimit("user:101", 3, 60);

    expect(rl1.allowed).toBe(true);
    expect(rl2.allowed).toBe(true);
    expect(rl3.allowed).toBe(true);
    expect(rl4.allowed).toBe(false);
  });

  it("buffers outbox events and resumes publishing without data loss", async () => {
    const event = await outbox.recordWorkspaceEvent({
      workspaceId: "ws_buffering",
      hostId: "host_local",
      eventType: WorkspaceEventType.GIT_STATUS_CHANGED,
      actorId: "actor_git",
      payload: { branch: "main", ahead: 1 },
    });

    const statsBefore = outbox.getOutboxStats();
    expect(statsBefore.publishedCount).toBeGreaterThanOrEqual(1);

    const received: any[] = [];
    await kafka.subscribe(event.type, async (ev) => {
      received.push(ev);
    });

    await kafka.publishEvent(event.type, event);
    expect(received.length).toBe(1);
    expect(received[0].id).toBe(event.id);
  });

  it("suppresses duplicate events when the same event ID is re-submitted", async () => {
    const rawEvents = [
      {
        eventId: "fsev_dup_test_100",
        sequenceNumber: 1,
        workspaceId: "ws_dup",
        type: WorkspaceEventType.FILE_UPDATED,
        operationType: "update",
        relativePath: "package.json",
        payload: { version: "1.0.1" },
        timestamp: new Date().toISOString(),
      },
    ];

    const res1 = await sync.syncAgentEvents("host_dup", rawEvents);
    expect(res1.acceptedEventIds).toEqual(["fsev_dup_test_100"]);
    expect(res1.duplicateEventIds).toEqual([]);

    const res2 = await sync.syncAgentEvents("host_dup", rawEvents);
    expect(res2.acceptedEventIds).toEqual([]);
    expect(res2.duplicateEventIds).toEqual(["fsev_dup_test_100"]);
  });

  it("reconciles missing events for a client that disconnected and reconnected", async () => {
    const wsId = "ws_reconcile_test";

    await outbox.recordWorkspaceEvent({
      workspaceId: wsId,
      hostId: "host_rec",
      eventType: WorkspaceEventType.FILE_CREATED,
      actorId: "user_x",
      payload: { path: "a.ts" },
    });
    await outbox.recordWorkspaceEvent({
      workspaceId: wsId,
      hostId: "host_rec",
      eventType: WorkspaceEventType.FILE_UPDATED,
      actorId: "user_x",
      payload: { path: "b.ts" },
    });
    await outbox.recordWorkspaceEvent({
      workspaceId: wsId,
      hostId: "host_rec",
      eventType: WorkspaceEventType.FILE_DELETED,
      actorId: "user_x",
      payload: { path: "c.ts" },
    });

    // Client was on revision 1 when disconnected
    const reconcile = await sync.reconcileClient(wsId, 1);

    expect(reconcile.currentRevision).toBe(3);
    // Missed revisions 2 and 3!
    expect(reconcile.events.length).toBe(2);
    expect((reconcile.events[0] as any).revision).toBe(2);
    expect((reconcile.events[1] as any).revision).toBe(3);
  });

  it("distributes events across multiple gateway instances using Redis Pub/Sub", async () => {
    const gatewayInstance1Received: any[] = [];
    const gatewayInstance2Received: any[] = [];

    await redis.subscribe(REDIS_CHANNELS.WORKSPACE_EVENTS("ws_shared"), (msg) => {
      gatewayInstance1Received.push(JSON.parse(msg));
    });

    await redis.subscribe(REDIS_CHANNELS.WORKSPACE_EVENTS("ws_shared"), (msg) => {
      gatewayInstance2Received.push(JSON.parse(msg));
    });

    const event = createDurableEvent({
      id: "ev_fanout_01",
      type: WorkspaceEventType.FILE_UPDATED,
      hostId: "host_shared",
      workspaceId: "ws_shared",
      actorId: "user_shared",
      revision: 4,
      payload: { message: "distributed sync" },
    });

    await redis.publish(REDIS_CHANNELS.WORKSPACE_EVENTS("ws_shared"), event);

    expect(gatewayInstance1Received.length).toBe(1);
    expect(gatewayInstance2Received.length).toBe(1);
    expect(gatewayInstance1Received[0].id).toBe("ev_fanout_01");
    expect(gatewayInstance2Received[0].id).toBe("ev_fanout_01");
  });

  it("immediately invalidates cached permissions in Redis when permissions are revoked", async () => {
    const sessionId = "sess_perm_test";

    await redis.cachePermissions(sessionId, ["fs:read", "fs:write", "terminal:execute"]);
    const initialPerms = await redis.getCachedPermissions(sessionId);
    expect(initialPerms).toEqual(["fs:read", "fs:write", "terminal:execute"]);

    await redis.invalidatePermissions(sessionId);
    const revokedPerms = await redis.getCachedPermissions(sessionId);
    expect(revokedPerms).toBeNull();
  });

  it("replays host-local events safely preserving sequence numbers and allocating authoritative revisions", async () => {
    const disconnectedEvents = [
      {
        eventId: "host_seq_1",
        sequenceNumber: 1,
        workspaceId: "ws_replay",
        type: WorkspaceEventType.FILE_CREATED,
        operationType: "create",
        relativePath: "config.json",
        payload: { env: "prod" },
        timestamp: new Date().toISOString(),
      },
      {
        eventId: "host_seq_2",
        sequenceNumber: 2,
        workspaceId: "ws_replay",
        type: WorkspaceEventType.FILE_UPDATED,
        operationType: "update",
        relativePath: "config.json",
        payload: { env: "prod", port: 8080 },
        timestamp: new Date().toISOString(),
      },
    ];

    const result = await sync.syncAgentEvents("host_replay_machine", disconnectedEvents);

    expect(result.processedCount).toBe(2);
    expect(result.acceptedEventIds).toEqual(["host_seq_1", "host_seq_2"]);
    expect(result.latestRevisions["ws_replay"]).toBe(2);

    const reconciled = await sync.reconcileClient("ws_replay", 0);
    expect(reconciled.events.length).toBe(2);
    expect((reconciled.events[0] as any).payload.hostSequenceNumber).toBe(1);
    expect((reconciled.events[1] as any).payload.hostSequenceNumber).toBe(2);
  });
});
