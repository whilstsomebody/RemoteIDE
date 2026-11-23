import { pino, Logger } from "pino";
import {
  HostPendingEvent,
  SyncEventsResult,
  ReconcileEventsResult,
  EventInfrastructureMetrics,
} from "@remote-ide/shared";
import { outboxService, OutboxService } from "./outbox.service.js";
import { redisService, RedisService } from "./redis.service.js";
import { kafkaService, KafkaService } from "./kafka.service.js";
import { tunnelRelayService, TunnelRelayService } from "./tunnel-relay.service.js";

export class SyncService {
  private logger: Logger;
  private outbox: OutboxService;
  private redis: RedisService;
  private kafka: KafkaService;
  private relay: TunnelRelayService;

  constructor(
    opts: {
      logger?: Logger;
      outbox?: OutboxService;
      redis?: RedisService;
      kafka?: KafkaService;
      relay?: TunnelRelayService;
    } = {}
  ) {
    this.logger = opts.logger || pino({ name: "sync-service" });
    this.outbox = opts.outbox || outboxService;
    this.redis = opts.redis || redisService;
    this.kafka = opts.kafka || kafkaService;
    this.relay = opts.relay || tunnelRelayService;
  }

  /**
   * Accepts and processes a batch of pending events recorded by a host agent.
   * Performs deduplication and transactional outbox allocation with sequential revisions.
   */
  public async syncAgentEvents(
    hostId: string,
    events: HostPendingEvent[]
  ): Promise<SyncEventsResult> {
    const acceptedEventIds: string[] = [];
    const duplicateEventIds: string[] = [];
    const latestRevisions: Record<string, number> = {};

    this.logger.info({ hostId, eventCount: events.length }, "Processing agent journal event sync");

    for (const ev of events) {
      if (this.outbox.isEventProcessed(ev.eventId)) {
        duplicateEventIds.push(ev.eventId);
        continue;
      }

      const durable = await this.outbox.recordWorkspaceEvent({
        id: ev.eventId,
        workspaceId: ev.workspaceId,
        hostId,
        eventType: ev.type,
        actorId: `host:${hostId}`,
        payload: {
          ...ev.payload,
          operationType: ev.operationType,
          relativePath: ev.relativePath,
          fileVersion: ev.fileVersion,
          hostSequenceNumber: ev.sequenceNumber,
        },
      });

      this.outbox.markEventProcessed(ev.eventId);
      acceptedEventIds.push(ev.eventId);

      if (durable.revision) {
        latestRevisions[ev.workspaceId] = Math.max(
          latestRevisions[ev.workspaceId] || 0,
          durable.revision
        );
      }
    }

    return {
      processedCount: events.length,
      acceptedEventIds,
      duplicateEventIds,
      latestRevisions,
    };
  }

  public async reconcileClient(
    workspaceId: string,
    sinceRevision: number = 0,
    limit: number = 100
  ): Promise<ReconcileEventsResult> {
    const result = this.outbox.getEventsSinceRevision(workspaceId, sinceRevision, limit);
    return {
      workspaceId,
      currentRevision: result.currentRevision,
      events: result.events as unknown as Array<Record<string, unknown>>,
      hasMore: result.hasMore,
    };
  }

  public getMetrics(): EventInfrastructureMetrics {
    const redisMetrics = this.redis.getMetrics();
    const kafkaMetrics = this.kafka.getMetrics();
    const outboxStats = this.outbox.getOutboxStats();

    return {
      redis: {
        cacheHits: redisMetrics.cacheHits,
        cacheMisses: redisMetrics.cacheMisses,
        hitRatio: redisMetrics.hitRatio,
        connected: redisMetrics.connected,
      },
      kafka: {
        publishedCount: kafkaMetrics.publishedCount,
        consumedCount: kafkaMetrics.consumedCount,
        consumerLag: kafkaMetrics.consumerLag,
        connected: kafkaMetrics.connected,
      },
      events: {
        processingLatencyMs: kafkaMetrics.processingLatencyMs,
        outboxPendingCount: outboxStats.pendingCount,
        deadLetterCount: outboxStats.failedCount,
      },
      websockets: {
        activeConnections: this.relay.getClientSocketCount(),
        subscribedWorkspacesCount: 1,
      },
    };
  }
}

export const syncService = new SyncService();
