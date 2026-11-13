import { describe, it, expect, vi } from "vitest";
import { WorkerService } from "../src/service.js";
import { WorkspaceEventType, createDurableEvent } from "@remote-ide/shared";

describe("WorkerService", () => {
  const env = {
    NODE_ENV: "test" as const,
    LOG_LEVEL: "info" as const,
    DATABASE_URL: "postgresql://mock:mock@localhost:5432/mock",
    REDIS_URL: "redis://localhost:6379",
    KAFKA_BROKERS: "localhost:9092",
    CONCURRENCY: 2,
  };

  it("starts and stops cleanly", async () => {
    const worker = new WorkerService(env);
    await worker.start();
    expect(worker.getStatus().isRunning).toBe(true);

    await worker.stop();
    expect(worker.getStatus().isRunning).toBe(false);
  });

  it("registers event handlers, dispatches events, and deduplicates identical event IDs", async () => {
    const worker = new WorkerService(env);
    const handler = vi.fn().mockResolvedValue(undefined);
    worker.registerHandler(WorkspaceEventType.FILE_UPDATED, handler);

    const event = createDurableEvent({
      id: "ev_test_123",
      type: WorkspaceEventType.FILE_UPDATED,
      hostId: "host-1",
      workspaceId: "ws-1",
      actorId: "user-1",
      revision: 1,
      payload: { path: "src/index.ts", action: "modify" },
    });

    // 1. First delivery -> processed
    const firstResult = await worker.processEvent(event);
    expect(firstResult).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(worker.getStatus().processedCount).toBe(1);

    // 2. Duplicate delivery with same event ID -> suppressed by deduplication
    const secondResult = await worker.processEvent(event);
    expect(secondResult).toBe(false);
    // Not called again!
    expect(handler).toHaveBeenCalledTimes(1);
    expect(worker.getStatus().processedCount).toBe(1);
  });
  it("retries failed handlers and serializes concurrent duplicate deliveries", async () => {
    const worker = new WorkerService(env);
    const handler = vi.fn().mockRejectedValueOnce(new Error("temporary failure")).mockResolvedValue(undefined);
    worker.registerHandler(WorkspaceEventType.FILE_UPDATED, handler);
    const event = createDurableEvent({ id: "retry", type: WorkspaceEventType.FILE_UPDATED, hostId: "host", actorId: "actor", payload: {} });
    await expect(worker.processEvent(event)).rejects.toThrow("temporary failure");
    expect(worker.getStatus().processedCount).toBe(0);
    const results = await Promise.all([worker.processEvent(event), worker.processEvent(event)]);
    expect(results).toEqual([true, false]);
    expect(handler).toHaveBeenCalledTimes(2);
    await worker.stop();
  });

});
