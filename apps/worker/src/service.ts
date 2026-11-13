import { pino, Logger } from "pino";
import { Kafka, Consumer, logLevel } from "kafkajs";
import { Redis } from "ioredis";
import { WorkerEnv, ALL_KAFKA_TOPICS, DurableEvent, REDIS_CHANNELS } from "@remote-ide/shared";

export type JobHandler<T = Record<string, unknown>> = (event: DurableEvent<T>) => Promise<void>;

export class WorkerService {
  private isRunning: boolean = false;
  private logger: Logger;
  private env: WorkerEnv;
  private handlers: Map<string, JobHandler[]> = new Map();
  private processedEventIds = new Set<string>(); // In-memory deduplication set
  private processedCount: number = 0;
  private failureCount: number = 0;

  private kafka: Kafka | null = null;
  private consumer: Consumer | null = null;
  private redis: Redis | null = null;
  private isKafkaConnected: boolean = false;
  private isRedisConnected: boolean = false;

  constructor(env: WorkerEnv, logger?: Logger) {
    this.env = env;
    this.logger = logger || pino({ level: env.LOG_LEVEL, name: "worker-service" });

    // Initialize Kafka client
    try {
      const brokers = (env.KAFKA_BROKERS || "localhost:9092").split(",").map((b) => b.trim());
      this.kafka = new Kafka({
        clientId: "remote-ide-worker",
        brokers,
        logLevel: logLevel.NOTHING,
        retry: {
          initialRetryTime: 100,
          retries: 3,
        },
      });

      this.consumer = this.kafka.consumer({
        groupId: "remote-ide-worker-group",
        allowAutoTopicCreation: true,
      });
    } catch (err) {
      this.logger.warn(
        { err },
        "Worker Kafka initialization failed, operating in resilient memory mode"
      );
    }

    // Initialize Redis client
    try {
      this.redis = new Redis(env.REDIS_URL || "redis://localhost:6379", {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        retryStrategy: (times) => (times > 3 ? null : Math.min(times * 100, 1000)),
        enableOfflineQueue: false,
      });

      this.redis.on("connect", () => {
        this.isRedisConnected = true;
        this.logger.info("Worker connected to Redis");
      });

      this.redis.on("error", (err) => {
        this.isRedisConnected = false;
        this.logger.warn({ err: err.message }, "Worker Redis connection error");
      });
    } catch (err) {
      this.logger.warn({ err }, "Worker Redis initialization failed");
    }
  }

  public registerHandler<T = Record<string, unknown>>(
    eventType: string,
    handler: JobHandler<T>
  ): void {
    const list = this.handlers.get(eventType) || [];
    list.push(handler as JobHandler);
    this.handlers.set(eventType, list);
    this.logger.debug({ eventType }, "Registered worker event handler");
  }

  /**
   * Process a durable event with idempotency and deduplication.
   */
  public async processEvent<T extends Record<string, unknown>>(
    event: DurableEvent<T>
  ): Promise<boolean> {
    // 1. Deduplication check
    if (this.processedEventIds.has(event.id)) {
      this.logger.debug({ eventId: event.id }, "Duplicate event suppressed in worker");
      return false;
    }

    this.logger.info(
      {
        eventId: event.id,
        eventType: event.type,
        workspaceId: event.workspaceId,
        revision: event.revision,
      },
      "Worker processing event"
    );

    const handlers = this.handlers.get(event.type) || [];
    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (err) {
        this.failureCount++;
        this.logger.error(
          { err, eventId: event.id, eventType: event.type },
          "Handler failed for event"
        );
      }
    }

    this.processedEventIds.add(event.id);
    if (this.processedEventIds.size > 10000) {
      // Bounded in-memory retention
      const first = this.processedEventIds.values().next().value;
      if (first) this.processedEventIds.delete(first);
    }
    this.processedCount++;

    // 2. Broadcast to Redis Pub/Sub for connected gateway fan-out
    if (this.isRedisConnected && this.redis) {
      try {
        const payloadStr = JSON.stringify(event);
        if (event.workspaceId) {
          await this.redis.publish(REDIS_CHANNELS.WORKSPACE_EVENTS(event.workspaceId), payloadStr);
        }
        await this.redis.publish(REDIS_CHANNELS.GATEWAY_BROADCAST, payloadStr);
      } catch (redisErr) {
        this.logger.warn({ redisErr }, "Failed to publish worker event to Redis");
      }
    }

    return true;
  }

  public async start(): Promise<void> {
    this.isRunning = true;
    this.logger.info(
      { concurrency: this.env.CONCURRENCY, nodeEnv: this.env.NODE_ENV },
      "Worker service started"
    );

    // Attempt connecting to Redis
    if (this.redis) {
      try {
        await this.redis.connect();
        this.isRedisConnected = true;
      } catch {
        this.logger.warn("Worker Redis connect failed (non-fatal)");
      }
    }

    // Attempt connecting to Kafka consumer
    if (this.consumer) {
      try {
        await this.consumer.connect();
        this.isKafkaConnected = true;

        for (const topic of ALL_KAFKA_TOPICS) {
          await this.consumer.subscribe({ topic, fromBeginning: false });
        }

        await this.consumer.run({
          eachMessage: async ({ message }) => {
            if (!message.value) return;
            try {
              const event = JSON.parse(message.value.toString()) as DurableEvent<any>;
              await this.processEvent(event);
            } catch (err) {
              this.logger.error({ err }, "Error parsing Kafka message in worker");
            }
          },
        });

        this.logger.info("Worker Kafka consumer running across all topics");
      } catch (err) {
        this.isKafkaConnected = false;
        this.logger.warn(
          { err },
          "Worker could not connect to Kafka broker, running in standalone mode"
        );
      }
    }
  }

  public async stop(): Promise<void> {
    this.isRunning = false;

    if (this.consumer) {
      try {
        await this.consumer.disconnect();
      } catch {}
    }

    if (this.redis) {
      try {
        await this.redis.quit();
      } catch {}
    }

    this.logger.info("Worker service stopped cleanly");
  }

  public getStatus(): {
    isRunning: boolean;
    processedCount: number;
    failureCount: number;
    registeredTypes: string[];
    isKafkaConnected: boolean;
    isRedisConnected: boolean;
  } {
    return {
      isRunning: this.isRunning,
      processedCount: this.processedCount,
      failureCount: this.failureCount,
      registeredTypes: Array.from(this.handlers.keys()),
      isKafkaConnected: this.isKafkaConnected,
      isRedisConnected: this.isRedisConnected,
    };
  }
}
