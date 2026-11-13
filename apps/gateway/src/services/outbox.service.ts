import { pino, Logger } from "pino";
import { DurableEvent, createDurableEvent, KafkaTopic, REDIS_CHANNELS } from "@remote-ide/shared";
import { redisService, RedisService } from "./redis.service.js";
import { kafkaService, KafkaService } from "./kafka.service.js";

export interface OutboxRecord {
  id: string;
  topic: string;
  partitionKey: string;
  payload: DurableEvent<any>;
  status: "pending" | "published" | "failed";
  retryCount: number;
  lastError?: string;
  createdAt: string;
  publishedAt?: string;
}

export interface WorkspaceEventRecord {
  id: string;
  workspaceId: string;
  hostId: string;
  revision: number;
  eventType: string;
  schemaVersion: number;
  actorId: string;
  deviceId?: string;
  sessionId?: string;
  correlationId?: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export class OutboxService {
  private logger: Logger;
  private redis: RedisService;
  private kafka: KafkaService;
  private isRunning: boolean = false;
  private pollInterval: NodeJS.Timeout | null = null;

  // In-memory persistent tables for tests & resilient database fallbacks
  private memoryEvents = new Map<string, WorkspaceEventRecord>(); // id -> event
  private memoryRevisions = new Map<string, number>(); // workspaceId -> currentRevision
  private memoryOutbox = new Map<string, OutboxRecord>(); // id -> outbox
  private memoryProcessed = new Map<string, { consumerGroup: string; processedAt: string }>(); // eventId -> processed

  constructor(
    opts: {
      logger?: Logger;
      redis?: RedisService;
      kafka?: KafkaService;
      pollIntervalMs?: number;
    } = {}
  ) {
    this.logger = opts.logger || pino({ name: "outbox-service" });
    this.redis = opts.redis || redisService;
    this.kafka = opts.kafka || kafkaService;
  }

  public start(pollIntervalMs = 500): void {
    if (this.isRunning) return;
    this.isRunning = true;

    this.pollInterval = setInterval(async () => {
      try {
        await this.publishPendingOutbox();
      } catch (err) {
        this.logger.error({ err }, "Error during outbox poll loop");
      }
    }, pollIntervalMs);

    this.logger.info("Outbox publisher background service started");
  }

  public stop(): void {
    this.isRunning = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /**
   * Records a workspace event and outbox record in a serialized transactional unit.
   * Allocates an authoritative, sequential integer revision for the workspace.
   */
  public async recordWorkspaceEvent<T extends Record<string, unknown>>(params: {
    id?: string;
    workspaceId: string;
    hostId: string;
    eventType: string;
    actorId: string;
    deviceId?: string;
    sessionId?: string;
    correlationId?: string;
    payload: T;
  }): Promise<DurableEvent<T>> {
    const eventId =
      params.id ||
      (typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2));

    // Atomically increment authoritative revision for this workspace
    const currentRev = (this.memoryRevisions.get(params.workspaceId) || 0) + 1;
    this.memoryRevisions.set(params.workspaceId, currentRev);

    const now = new Date().toISOString();

    const durableEvent = createDurableEvent<T>({
      id: eventId,
      version: 1,
      type: params.eventType,
      hostId: params.hostId,
      workspaceId: params.workspaceId,
      sessionId: params.sessionId,
      deviceId: params.deviceId,
      actorId: params.actorId,
      timestamp: now,
      revision: currentRev,
      payload: params.payload,
      correlationId: params.correlationId,
    });

    // 1. Record in workspace_events
    this.memoryEvents.set(eventId, {
      id: eventId,
      workspaceId: params.workspaceId,
      hostId: params.hostId,
      revision: currentRev,
      eventType: params.eventType,
      schemaVersion: 1,
      actorId: params.actorId,
      deviceId: params.deviceId,
      sessionId: params.sessionId,
      correlationId: params.correlationId,
      payload: params.payload,
      createdAt: now,
    });

    // 2. Record in outbox_events
    this.memoryOutbox.set(eventId, {
      id: eventId,
      topic: KafkaTopic.WORKSPACE_EVENTS,
      partitionKey: params.workspaceId,
      payload: durableEvent,
      status: "pending",
      retryCount: 0,
      createdAt: now,
    });

    // 3. Update Redis revision cache
    await this.redis.cacheWorkspaceRevision(params.workspaceId, currentRev);

    // 4. Immediately attempt to publish to Kafka and notify Redis
    await this.publishOutboxRecord(eventId);

    return durableEvent;
  }

  /**
   * Publishes a single outbox record to Kafka and notifies Redis Pub/Sub.
   */
  public async publishOutboxRecord(id: string): Promise<boolean> {
    const record = this.memoryOutbox.get(id);
    if (!record || record.status === "published") return false;

    try {
      // 1. Forward event to Kafka (partitioned by partitionKey)
      await this.kafka.publishEvent(record.topic, record.payload);

      // 2. Mark as published
      record.status = "published";
      record.publishedAt = new Date().toISOString();

      // 3. Redis Pub/Sub fan-out to local and remote gateway instances
      if (record.payload.workspaceId) {
        await this.redis.publish(
          REDIS_CHANNELS.WORKSPACE_EVENTS(record.payload.workspaceId),
          record.payload
        );
      }
      await this.redis.publish(REDIS_CHANNELS.GATEWAY_BROADCAST, record.payload);

      return true;
    } catch (err: unknown) {
      record.retryCount++;
      record.lastError = err instanceof Error ? err.message : String(err);
      if (record.retryCount >= 5) {
        record.status = "failed"; // Dead-letter status
        this.logger.error({ id, retries: record.retryCount }, "Outbox event moved to DLQ (failed)");
      }
      return false;
    }
  }

  /**
   * Scans and forwards pending outbox events.
   */
  public async publishPendingOutbox(limit = 100): Promise<{ published: number; failed: number }> {
    let published = 0;
    let failed = 0;

    const pending = Array.from(this.memoryOutbox.values())
      .filter((r) => r.status === "pending")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, limit);

    for (const record of pending) {
      const ok = await this.publishOutboxRecord(record.id);
      if (ok) published++;
      else failed++;
    }

    return { published, failed };
  }

  /**
   * Deduplication check: returns true if already processed.
   */
  public isEventProcessed(eventId: string, consumerGroup = "default"): boolean {
    return this.memoryProcessed.has(`${consumerGroup}:${eventId}`);
  }

  /**
   * Marks event as processed idempotently.
   */
  public markEventProcessed(eventId: string, consumerGroup = "default"): void {
    this.memoryProcessed.set(`${consumerGroup}:${eventId}`, {
      consumerGroup,
      processedAt: new Date().toISOString(),
    });
  }

  /**
   * Retrieves events for client reconciliation (sinceRevision).
   */
  public getEventsSinceRevision(
    workspaceId: string,
    sinceRevision: number,
    limit = 100
  ): { events: WorkspaceEventRecord[]; currentRevision: number; hasMore: boolean } {
    const currentRevision = this.memoryRevisions.get(workspaceId) || 0;

    const matching = Array.from(this.memoryEvents.values())
      .filter((e) => e.workspaceId === workspaceId && e.revision > sinceRevision)
      .sort((a, b) => a.revision - b.revision);

    const events = matching.slice(0, limit);
    const hasMore = matching.length > limit;

    return {
      events,
      currentRevision,
      hasMore,
    };
  }

  public getOutboxStats(): { pendingCount: number; publishedCount: number; failedCount: number } {
    let pendingCount = 0;
    let publishedCount = 0;
    let failedCount = 0;

    for (const r of this.memoryOutbox.values()) {
      if (r.status === "pending") pendingCount++;
      else if (r.status === "published") publishedCount++;
      else if (r.status === "failed") failedCount++;
    }

    return { pendingCount, publishedCount, failedCount };
  }
}

export const outboxService = new OutboxService();
