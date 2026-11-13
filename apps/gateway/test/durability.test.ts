import { expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GatewayStateStore } from "../src/services/state-store.js";
import { AuthService } from "../src/services/auth.service.js";
import { OutboxService } from "../src/services/outbox.service.js";
import { RedisService } from "../src/services/redis.service.js";
import { KafkaService } from "../src/services/kafka.service.js";
import { SyncService } from "../src/services/sync.service.js";

it("retains owner accounts, revoked sessions, revisions and pending events across restart", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gateway-durable-"));
  const file = path.join(dir, "state.sqlite");
  let store = new GatewayStateStore(file);
  const redis = new RedisService();
  const kafka = new KafkaService({ enableFallback: true });
  const publish = vi.spyOn(kafka, "publishEvent").mockRejectedValue(new Error("broker offline"));
  try {
    const auth = new AuthService(store);
    const owner = await auth.bootstrapOwner({ email: "owner@example.com", password: "secure-password", displayName: "Owner", localSetupToken: auth.getSetupToken(), remoteIp: "127.0.0.1" });
    auth.revokeSession(owner.session.id, owner.user.id);
    let outbox = new OutboxService({ stateStore: store, redis, kafka });
    await outbox.recordWorkspaceEvent({ id: "event-1", workspaceId: "ws", hostId: "host", eventType: "workspace.file.updated", actorId: "owner", payload: { path: "a.txt" } });
    expect(outbox.getOutboxStats().pendingCount).toBe(1);
    store.close();
    store = new GatewayStateStore(file);
    const restarted = new AuthService(store);
    expect(restarted.isOwnerBootstrapped()).toBe(true);
    expect(restarted.getSessionByToken(owner.sessionToken)).toBeNull();
    expect((await restarted.login({ email: "owner@example.com", password: "secure-password", ipAddress: "127.0.0.1" })).user.id).toBe(owner.user.id);
    outbox = new OutboxService({ stateStore: store, redis, kafka });
    expect(outbox.isEventProcessed("event-1")).toBe(true);
    expect(outbox.getEventsSinceRevision("ws", 0).currentRevision).toBe(1);
    publish.mockResolvedValue(undefined);
    expect((await outbox.publishPendingOutbox()).published).toBe(1);
    const duplicate = await outbox.recordWorkspaceEvent({ id: "event-1", workspaceId: "ws", hostId: "host", eventType: "workspace.file.updated", actorId: "owner", payload: {} });
    expect(duplicate.revision).toBe(1);
    expect(outbox.getEventsSinceRevision("ws", 0).events).toHaveLength(1);
  } finally {
    store.close(); await redis.close(); await kafka.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

it("does not acknowledge an event as duplicate after its durable write failed", async () => {
  const redis = new RedisService();
  const kafka = new KafkaService({ enableFallback: true });
  const outbox = new OutboxService({ redis, kafka });
  const sync = new SyncService({ outbox, redis, kafka });
  const record = vi.spyOn(outbox, "recordWorkspaceEvent").mockRejectedValueOnce(new Error("disk full"));
  const events = [{ eventId: "retry-event", sequenceNumber: 1, workspaceId: "ws", type: "workspace.file.updated", operationType: "update", relativePath: "a", timestamp: new Date().toISOString(), payload: {} }];
  try {
    await expect(sync.syncAgentEvents("host", events)).rejects.toThrow("disk full");
    expect((await sync.syncAgentEvents("host", events)).acceptedEventIds).toEqual(["retry-event"]);
    expect(record).toHaveBeenCalledTimes(2);
  } finally { await redis.close(); await kafka.close(); }
});
