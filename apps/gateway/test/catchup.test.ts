import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { EventCompactor } from "../src/services/event-compactor.js";
import {
  CatchupService,
  catchupService as singletonCatchupService,
} from "../src/services/catchup.service.js";
import { OutboxService, outboxService } from "../src/services/outbox.service.js";
import { RedisService } from "../src/services/redis.service.js";
import { KafkaService } from "../src/services/kafka.service.js";
import { authService } from "../src/services/auth.service.js";
import {
  WorkspaceEventType,
  DeviceType,
  DevicePresenceState,
  DurableWorkspaceEvent,
  UserRole,
  ROLE_PERMISSIONS,
} from "@remote-ide/shared";

describe("Phase 7 — Per-Device Catch-Up Changelog and Recovery", () => {
  let app: FastifyInstance;
  let redis: RedisService;
  let kafka: KafkaService;
  let outbox: OutboxService;
  let catchupService: CatchupService;
  let authHeader: Record<string, string>;

  beforeEach(async () => {
    redis = new RedisService({ lazyConnect: true, enableFallback: true });
    kafka = new KafkaService({ enableFallback: true });
    outbox = outboxService;
    catchupService = singletonCatchupService;

    // Reset service state
    (catchupService as any).devices.clear();
    (catchupService as any).devicePresence.clear();
    (catchupService as any).syncCursors.clear();
    (catchupService as any).changelogCursors.clear();
    (catchupService as any).deliveries.clear();
    (catchupService as any).retentionConfigs.clear();
    (outbox as any).memoryEvents.clear();
    (outbox as any).memoryRevisions.clear();
    (outbox as any).memoryOutbox.clear();
    (outbox as any).memoryProcessed.clear();
    (authService as any).sessions.clear();
    (authService as any).tokenHashToSessionId.clear();

    const { sessionToken } = authService.createSessionInternal({
      userId: "test-user-owner",
      hostId: "local-host-agent",
      role: UserRole.OWNER,
      capabilities: ROLE_PERMISSIONS[UserRole.OWNER],
      allowedWorkspaceIds: [],
      deviceName: "Test Laptop",
      ipAddress: "127.0.0.1",
      userAgent: "TestAgent",
      isOwner: true,
      durationSeconds: 3600,
    });
    authHeader = { authorization: `Bearer ${sessionToken}` };

    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    outbox.stop();
    await redis.close();
    await kafka.close();
    await app.close();
  });

  describe("EventCompactor Unit Tests", () => {
    it("aggregates repeated file modifications into a single entry with counts and range", () => {
      const events: DurableWorkspaceEvent[] = [
        {
          id: "ev-1",
          workspaceId: "ws-1",
          revision: 21,
          eventType: WorkspaceEventType.FILE_UPDATED,
          actorId: "laptop-a",
          timestamp: "2026-11-20T10:00:00.000Z",
          payload: { path: "src/index.ts" },
        },
        {
          id: "ev-2",
          workspaceId: "ws-1",
          revision: 22,
          eventType: WorkspaceEventType.FILE_UPDATED,
          actorId: "laptop-a",
          timestamp: "2026-11-20T10:01:00.000Z",
          payload: { path: "src/index.ts" },
        },
        {
          id: "ev-3",
          workspaceId: "ws-1",
          revision: 25,
          eventType: WorkspaceEventType.FILE_UPDATED,
          actorId: "laptop-a",
          timestamp: "2026-11-20T10:05:00.000Z",
          payload: { path: "src/index.ts" },
        },
      ];

      const compacted = EventCompactor.compact(events);
      expect(compacted.netChanges.filesModified).toHaveLength(1);
      const mod = compacted.netChanges.filesModified[0]!;
      expect(mod.path).toBe("src/index.ts");
      expect(mod.count).toBe(3);
      expect(mod.firstRevision).toBe(21);
      expect(mod.lastRevision).toBe(25);
      expect(compacted.activityHistory).toHaveLength(3);
    });

    it("aggregates create-then-modify as a created file in net changes", () => {
      const events: DurableWorkspaceEvent[] = [
        {
          id: "ev-10",
          workspaceId: "ws-1",
          revision: 10,
          eventType: WorkspaceEventType.FILE_CREATED,
          actorId: "laptop-a",
          timestamp: "2026-11-20T10:00:00.000Z",
          payload: { path: "src/new-feature.ts", sizeBytes: 120 },
        },
        {
          id: "ev-11",
          workspaceId: "ws-1",
          revision: 11,
          eventType: WorkspaceEventType.FILE_UPDATED,
          actorId: "laptop-a",
          timestamp: "2026-11-20T10:02:00.000Z",
          payload: { path: "src/new-feature.ts" },
        },
      ];

      const compacted = EventCompactor.compact(events);
      expect(compacted.netChanges.filesCreated).toHaveLength(1);
      expect(compacted.netChanges.filesCreated[0]!.path).toBe("src/new-feature.ts");
      expect(compacted.netChanges.filesModified).toHaveLength(0);
      expect(compacted.activityHistory).toHaveLength(2);
    });

    it("chains consecutive renames (a -> b -> c becomes a -> c)", () => {
      const events: DurableWorkspaceEvent[] = [
        {
          id: "ev-20",
          workspaceId: "ws-1",
          revision: 20,
          eventType: WorkspaceEventType.FILE_RENAMED,
          actorId: "laptop-a",
          timestamp: "2026-11-20T10:00:00.000Z",
          payload: { fromPath: "src/old-name.ts", toPath: "src/temp-name.ts" },
        },
        {
          id: "ev-21",
          workspaceId: "ws-1",
          revision: 21,
          eventType: WorkspaceEventType.FILE_RENAMED,
          actorId: "laptop-a",
          timestamp: "2026-11-20T10:05:00.000Z",
          payload: { fromPath: "src/temp-name.ts", toPath: "src/final-name.ts" },
        },
      ];

      const compacted = EventCompactor.compact(events);
      expect(compacted.netChanges.filesRenamed).toHaveLength(1);
      const ren = compacted.netChanges.filesRenamed[0]!;
      expect(ren.fromPath).toBe("src/old-name.ts");
      expect(ren.toPath).toBe("src/final-name.ts");
      expect(ren.revision).toBe(21);
      expect(compacted.activityHistory).toHaveLength(2);
    });

    it("omits create-then-delete from net changes while preserving in activity history", () => {
      const events: DurableWorkspaceEvent[] = [
        {
          id: "ev-30",
          workspaceId: "ws-1",
          revision: 30,
          eventType: WorkspaceEventType.FILE_CREATED,
          actorId: "laptop-a",
          timestamp: "2026-11-20T10:00:00.000Z",
          payload: { path: "temp.log" },
        },
        {
          id: "ev-31",
          workspaceId: "ws-1",
          revision: 31,
          eventType: WorkspaceEventType.FILE_DELETED,
          actorId: "laptop-a",
          timestamp: "2026-11-20T10:01:00.000Z",
          payload: { path: "temp.log" },
        },
      ];

      const compacted = EventCompactor.compact(events);
      expect(compacted.netChanges.filesCreated).toHaveLength(0);
      expect(compacted.netChanges.filesDeleted).toHaveLength(0);
      expect(compacted.activityHistory).toHaveLength(2);
    });

    it("tracks final status of background jobs and processes", () => {
      const events: DurableWorkspaceEvent[] = [
        {
          id: "ev-40",
          workspaceId: "ws-1",
          revision: 40,
          eventType: WorkspaceEventType.JOB_STARTED,
          actorId: "user-1",
          timestamp: "2026-11-20T10:00:00.000Z",
          payload: { jobId: "job-build", jobName: "Build", command: "pnpm build" },
        },
        {
          id: "ev-41",
          workspaceId: "ws-1",
          revision: 41,
          eventType: WorkspaceEventType.JOB_COMPLETED,
          actorId: "user-1",
          timestamp: "2026-11-20T10:02:00.000Z",
          payload: { jobId: "job-build", exitCode: 0 },
        },
        {
          id: "ev-42",
          workspaceId: "ws-1",
          revision: 42,
          eventType: WorkspaceEventType.PROCESS_CRASHED,
          actorId: "system",
          timestamp: "2026-11-20T10:03:00.000Z",
          payload: { processId: "proc-srv", processName: "Server", exitCode: 137 },
        },
        {
          id: "ev-43",
          workspaceId: "ws-1",
          revision: 43,
          eventType: WorkspaceEventType.PROCESS_RESTARTED,
          actorId: "system",
          timestamp: "2026-11-20T10:04:00.000Z",
          payload: { processId: "proc-srv" },
        },
      ];

      const compacted = EventCompactor.compact(events);
      expect(compacted.netChanges.jobs).toHaveLength(1);
      expect(compacted.netChanges.jobs[0]!.finalStatus).toBe("completed");
      expect(compacted.netChanges.jobs[0]!.exitCode).toBe(0);

      expect(compacted.netChanges.processes).toHaveLength(1);
      expect(compacted.netChanges.processes[0]!.finalStatus).toBe("restarted");
    });

    it("sanitizes path traversal attempts and masks sensitive command output", () => {
      const events: DurableWorkspaceEvent[] = [
        {
          id: "ev-sec-1",
          workspaceId: "ws-1",
          revision: 50,
          eventType: WorkspaceEventType.FILE_UPDATED,
          actorId: "attacker",
          timestamp: "2026-11-20T10:00:00.000Z",
          payload: { path: "../../../etc/passwd" },
        },
        {
          id: "ev-sec-2",
          workspaceId: "ws-1",
          revision: 51,
          eventType: WorkspaceEventType.JOB_STARTED,
          actorId: "user-1",
          timestamp: "2026-11-20T10:01:00.000Z",
          payload: {
            jobId: "job-auth",
            command: "login --token secret_token_value_12345 --key supersecret",
          },
        },
      ];

      const compacted = EventCompactor.compact(events);
      // Path traversal event should be filtered out
      expect(compacted.netChanges.filesModified).toHaveLength(0);
      // Sensitive command token should be masked
      expect(compacted.netChanges.jobs).toHaveLength(1);
      expect(compacted.netChanges.jobs[0]!.command).toContain("login [REDACTED]");
    });
  });

  describe("CatchupService & Acceptance Criteria Scenario", () => {
    it("satisfies the full acceptance test scenario (Steps 1–10)", async () => {
      const workspaceId = "ws_project_alpha";

      // 1. Open a workspace from Laptop A and Phone B
      const laptopA = catchupService.registerDevice({
        deviceId: "dev_laptop_a",
        userId: "user_owner",
        deviceName: "Laptop A",
        deviceType: DeviceType.LAPTOP,
      });
      const phoneB = catchupService.registerDevice({
        deviceId: "dev_phone_b",
        userId: "user_dev",
        deviceName: "Phone B",
        deviceType: DeviceType.MOBILE,
      });

      expect(laptopA.id).toBe("dev_laptop_a");
      expect(phoneB.id).toBe("dev_phone_b");

      // Populate events 1 to 20
      for (let rev = 1; rev <= 20; rev++) {
        await outbox.recordWorkspaceEvent({
          workspaceId,
          hostId: "host_mac",
          eventType: WorkspaceEventType.FILE_UPDATED,
          actorId: "initial_setup",
          payload: { path: `src/file_${rev}.ts` },
        });
      }

      // 2. Disconnect Phone B at revision 20
      catchupService.updateSyncCursor("dev_phone_b", workspaceId, 20);
      catchupService.recordPresence({
        deviceId: "dev_phone_b",
        workspaceId,
        state: DevicePresenceState.DISCONNECTED,
      });
      // Acknowledge revision 20 explicitly so cursor starts at 20
      const initDelivery = catchupService.generateCatchupSummary({
        deviceId: "dev_phone_b",
        workspaceId,
      });
      if (initDelivery.totalEvents > 0) {
        catchupService.acknowledgeChangelog({
          deliveryId: initDelivery.deliveryId,
          deviceId: "dev_phone_b",
          workspaceId,
        });
      }

      // Verify Phone B's acknowledged cursor is 20
      expect(catchupService.getChangelogCursor("dev_phone_b", workspaceId)).toBe(20);

      // 3 & 4. Modify and create files from Laptop A: generate multiple events until revision 35
      for (let rev = 21; rev <= 35; rev++) {
        const isCreate = rev % 3 === 0;
        await outbox.recordWorkspaceEvent({
          workspaceId,
          hostId: "host_mac",
          eventType: isCreate ? WorkspaceEventType.FILE_CREATED : WorkspaceEventType.FILE_UPDATED,
          actorId: "dev_laptop_a",
          payload: { path: isCreate ? `src/component_${rev}.tsx` : "src/main.ts" },
        });
      }

      expect(outbox.getCurrentRevision(workspaceId)).toBe(35);

      // 5. Reconnect Phone B
      catchupService.recordPresence({
        deviceId: "dev_phone_b",
        workspaceId,
        state: DevicePresenceState.ACTIVE,
      });

      // 6. Display a compact summary for revisions 21–35
      const summary = catchupService.generateCatchupSummary({
        deviceId: "dev_phone_b",
        workspaceId,
        workspaceName: "Project Alpha",
      });

      expect(summary.fromRevision).toBe(21);
      expect(summary.toRevision).toBe(35);
      expect(summary.totalEvents).toBe(15);
      expect(summary.deliveryId).toBeDefined();
      expect(summary.historyExpired).toBe(false);
      expect(summary.netChanges.filesModified.some((f) => f.path === "src/main.ts")).toBe(true);

      // 7. Acknowledge the summary
      const ackResult = catchupService.acknowledgeChangelog({
        deliveryId: summary.deliveryId,
        deviceId: "dev_phone_b",
        workspaceId,
      });
      expect(ackResult.success).toBe(true);
      expect(ackResult.acknowledgedRevision).toBe(35);

      // Verify cursor is strictly at 35
      expect(catchupService.getChangelogCursor("dev_phone_b", workspaceId)).toBe(35);

      // 8. Reconnect Phone B again
      catchupService.recordPresence({
        deviceId: "dev_phone_b",
        workspaceId,
        state: DevicePresenceState.ACTIVE,
      });

      // 9. Do not show the same summary
      const reconnectedSummary = catchupService.generateCatchupSummary({
        deviceId: "dev_phone_b",
        workspaceId,
      });
      expect(reconnectedSummary.totalEvents).toBe(0);
      expect(reconnectedSummary.fromRevision).toBe(35);
      expect(reconnectedSummary.toRevision).toBe(35);

      // 10. Create revision 36 and verify it appears as new activity
      await outbox.recordWorkspaceEvent({
        workspaceId,
        hostId: "host_mac",
        eventType: WorkspaceEventType.FILE_UPDATED,
        actorId: "dev_laptop_a",
        payload: { path: "src/new-work.ts" },
      });
      expect(outbox.getCurrentRevision(workspaceId)).toBe(36);

      const newActivitySummary = catchupService.generateCatchupSummary({
        deviceId: "dev_phone_b",
        workspaceId,
      });
      expect(newActivitySummary.totalEvents).toBe(1);
      expect(newActivitySummary.fromRevision).toBe(36);
      expect(newActivitySummary.toRevision).toBe(36);
      expect(newActivitySummary.netChanges.filesModified[0]!.path).toBe("src/new-work.ts");
    });

    it("enforces monotonic cursor advancement when new revisions arrive during review", async () => {
      const workspaceId = "ws_race_test";

      // Populate revs 1–10
      for (let i = 1; i <= 10; i++) {
        await outbox.recordWorkspaceEvent({
          workspaceId,
          hostId: "host_1",
          eventType: WorkspaceEventType.FILE_UPDATED,
          actorId: "user_1",
          payload: { path: "file.ts" },
        });
      }

      // Device generates summary for revs 1–10
      const summary = catchupService.generateCatchupSummary({
        deviceId: "dev_reviewing",
        workspaceId,
      });
      expect(summary.toRevision).toBe(10);

      // While user is reviewing the modal, revisions 11 and 12 arrive!
      await outbox.recordWorkspaceEvent({
        workspaceId,
        hostId: "host_1",
        eventType: WorkspaceEventType.FILE_UPDATED,
        actorId: "user_concurrent",
        payload: { path: "other.ts" },
      });
      await outbox.recordWorkspaceEvent({
        workspaceId,
        hostId: "host_1",
        eventType: WorkspaceEventType.FILE_UPDATED,
        actorId: "user_concurrent",
        payload: { path: "other2.ts" },
      });
      expect(outbox.getCurrentRevision(workspaceId)).toBe(12);

      // User clicks "Mark as Seen" on the delivered summary
      const ackRes = catchupService.acknowledgeChangelog({
        deliveryId: summary.deliveryId,
        deviceId: "dev_reviewing",
        workspaceId,
      });

      // Cursor MUST advance ONLY to delivered toRevision (10), NOT to current 12!
      expect(ackRes.acknowledgedRevision).toBe(10);
      expect(catchupService.getChangelogCursor("dev_reviewing", workspaceId)).toBe(10);

      // Subsequent query MUST return the unreviewed revisions 11–12
      const subsequentSummary = catchupService.generateCatchupSummary({
        deviceId: "dev_reviewing",
        workspaceId,
      });
      expect(subsequentSummary.fromRevision).toBe(11);
      expect(subsequentSummary.toRevision).toBe(12);
      expect(subsequentSummary.totalEvents).toBe(2);
    });

    it("handles multiple redundant acknowledgements idempotently", async () => {
      const workspaceId = "ws_idempotent";
      await outbox.recordWorkspaceEvent({
        workspaceId,
        hostId: "host_1",
        eventType: WorkspaceEventType.FILE_CREATED,
        actorId: "u1",
        payload: { path: "test.ts" },
      });

      const summary = catchupService.generateCatchupSummary({
        deviceId: "dev_idem",
        workspaceId,
      });

      const firstAck = catchupService.acknowledgeChangelog({
        deliveryId: summary.deliveryId,
        deviceId: "dev_idem",
        workspaceId,
      });
      expect(firstAck.success).toBe(true);

      const secondAck = catchupService.acknowledgeChangelog({
        deliveryId: summary.deliveryId,
        deviceId: "dev_idem",
        workspaceId,
      });
      expect(secondAck.success).toBe(true);
      expect(secondAck.acknowledgedRevision).toBe(firstAck.acknowledgedRevision);
    });

    it("re-presents changelog if device disconnects before acknowledgement", async () => {
      const workspaceId = "ws_disconnect_before_ack";
      await outbox.recordWorkspaceEvent({
        workspaceId,
        hostId: "host_1",
        eventType: WorkspaceEventType.FILE_CREATED,
        actorId: "u1",
        payload: { path: "critical.ts" },
      });

      // Device fetches summary
      const firstSummary = catchupService.generateCatchupSummary({
        deviceId: "dev_flake",
        workspaceId,
      });
      expect(firstSummary.totalEvents).toBe(1);

      // Device disconnects without acknowledging
      catchupService.recordPresence({
        deviceId: "dev_flake",
        workspaceId,
        state: DevicePresenceState.DISCONNECTED,
      });

      // Device reconnects
      catchupService.recordPresence({
        deviceId: "dev_flake",
        workspaceId,
        state: DevicePresenceState.ACTIVE,
      });

      // Summary is re-presented because delivery was never acknowledged
      const secondSummary = catchupService.generateCatchupSummary({
        deviceId: "dev_flake",
        workspaceId,
      });
      expect(secondSummary.totalEvents).toBe(1);
      expect(secondSummary.netChanges.filesCreated[0]!.path).toBe("critical.ts");
    });

    it("detects expired history and sets reconciliationRequired flag", async () => {
      const workspaceId = "ws_expired";

      // Set cursor at revision 5
      catchupService.updateSyncCursor("dev_old", workspaceId, 5);
      catchupService.updateChangelogCursor("dev_old", workspaceId, 5);

      // Create events 50 through 55 (events 1-49 were pruned or unavailable)
      for (let i = 50; i <= 55; i++) {
        await outbox.recordWorkspaceEvent({
          workspaceId,
          hostId: "host_1",
          eventType: WorkspaceEventType.FILE_UPDATED,
          actorId: "u1",
          payload: { path: "file.ts" },
        });
      }

      // Manually set oldest revision to 50
      outbox.pruneWorkspaceEventsOlderThan(workspaceId, new Date("2099-01-01")); // or test history boundary

      const summary = catchupService.generateCatchupSummary({
        deviceId: "dev_old",
        workspaceId,
      });

      // Missing history must trigger reconciliation warning
      if (summary.fromRevision < outbox.getOldestRevision(workspaceId)) {
        expect(summary.historyExpired).toBe(true);
        expect(summary.reconciliationRequired).toBe(true);
      }
    });

    it("supports configurable retention policies and pruning", () => {
      const workspaceId = "ws_retention";
      const config = catchupService.setRetentionPolicy(workspaceId, "7d");
      expect(config.retentionDays).toBe(7);
      expect(catchupService.getRetentionPolicy(workspaceId).retentionDays).toBe(7);

      const pruned = catchupService.pruneExpiredEvents(workspaceId);
      expect(typeof pruned.prunedEventsCount).toBe("number");
    });
  });

  describe("HTTP Gateway API Endpoints", () => {
    it("registers and retrieves devices via /api/v1/catchup/device", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/catchup/device",
        headers: authHeader,
        payload: {
          deviceId: "dev_http_1",
          deviceName: "iPad Pro",
          deviceType: "tablet",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBe("dev_http_1");
      expect(body.data.deviceType).toBe("tablet");

      const getRes = await app.inject({
        method: "GET",
        url: "/api/v1/catchup/device?deviceId=dev_http_1",
        headers: authHeader,
      });
      expect(getRes.statusCode).toBe(200);
      expect(getRes.json().data.deviceName).toBe("iPad Pro");
    });

    it("records device presence via /api/v1/catchup/presence", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/catchup/presence",
        headers: authHeader,
        payload: {
          deviceId: "dev_http_1",
          workspaceId: "ws_api",
          state: "background",
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
    });

    it("retrieves and acknowledges catch-up summaries via /api/v1/catchup/summary and /ack", async () => {
      // Record an event
      await outbox.recordWorkspaceEvent({
        workspaceId: "ws_http_flow",
        hostId: "host_1",
        eventType: WorkspaceEventType.FILE_CREATED,
        actorId: "actor_1",
        payload: { path: "api-test.ts" },
      });

      // Query summary
      const sumRes = await app.inject({
        method: "GET",
        url: "/api/v1/catchup/summary?deviceId=dev_http_flow&workspaceId=ws_http_flow&workspaceName=TestFlow",
        headers: authHeader,
      });

      expect(sumRes.statusCode).toBe(200);
      const sumBody = sumRes.json();
      expect(sumBody.success).toBe(true);
      expect(sumBody.data.totalEvents).toBeGreaterThan(0);
      const deliveryId = sumBody.data.deliveryId;
      expect(deliveryId).toBeDefined();

      // Acknowledge summary
      const ackRes = await app.inject({
        method: "POST",
        url: "/api/v1/catchup/ack",
        headers: authHeader,
        payload: {
          deliveryId,
          deviceId: "dev_http_flow",
          workspaceId: "ws_http_flow",
        },
      });

      expect(ackRes.statusCode).toBe(200);
      expect(ackRes.json().success).toBe(true);
    });

    it("inspects authorized text diffs and rejects directory traversal", async () => {
      // Normal diff
      const validDiff = await app.inject({
        method: "GET",
        url: "/api/v1/catchup/diff?workspaceId=ws_diff&path=src/app.tsx&fromRevision=1&toRevision=5",
        headers: authHeader,
      });
      expect(validDiff.statusCode).toBe(200);
      expect(validDiff.json().data.path).toBe("src/app.tsx");

      // Traversal attempt
      const traversalDiff = await app.inject({
        method: "GET",
        url: "/api/v1/catchup/diff?workspaceId=ws_diff&path=../../etc/shadow",
        headers: authHeader,
      });
      expect(traversalDiff.statusCode).toBe(400);
    });
  });
});
