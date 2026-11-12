import { describe, it, expect, vi } from "vitest";
import { WorkerService } from "../src/service.js";
import { DomainEventType, createEventEnvelope } from "@remote-ide/shared";

describe("WorkerService", () => {
  it("starts and stops cleanly", async () => {
    const worker = new WorkerService({
      NODE_ENV: "test",
      LOG_LEVEL: "info",
      DATABASE_URL: "postgresql://mock:mock@localhost:5432/mock",
      REDIS_URL: "redis://localhost:6379",
      KAFKA_BROKERS: "localhost:9092",
      CONCURRENCY: 2,
    });

    await worker.start();
    expect(worker.getStatus().isRunning).toBe(true);

    await worker.stop();
    expect(worker.getStatus().isRunning).toBe(false);
  });

  it("registers event handlers and dispatches events", async () => {
    const worker = new WorkerService({
      NODE_ENV: "test",
      LOG_LEVEL: "info",
      DATABASE_URL: "postgresql://mock:mock@localhost:5432/mock",
      REDIS_URL: "redis://localhost:6379",
      KAFKA_BROKERS: "localhost:9092",
      CONCURRENCY: 2,
    });

    const handler = vi.fn().mockResolvedValue(undefined);
    worker.registerHandler(DomainEventType.HOST_CONNECTED, handler);

    const event = createEventEnvelope(DomainEventType.HOST_CONNECTED, "test-source", {
      hostId: "host-123",
    });

    await worker.processEvent(event);

    expect(handler).toHaveBeenCalledWith({ hostId: "host-123" });
    expect(worker.getStatus().processedCount).toBe(1);
  });
});
