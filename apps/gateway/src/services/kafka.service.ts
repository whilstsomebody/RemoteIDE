import { Kafka, Producer, Consumer, Admin, logLevel } from "kafkajs";
import { pino, Logger } from "pino";
import { KafkaTopic, ALL_KAFKA_TOPICS, DurableEvent } from "@remote-ide/shared";

export interface KafkaServiceOptions {
  brokers?: string[];
  clientId?: string;
  logger?: Logger;
  enableFallback?: boolean;
}

export type EventHandler<T = Record<string, unknown>> = (event: DurableEvent<T>) => Promise<void>;

export class KafkaService {
  private kafka: Kafka | null = null;
  private producer: Producer | null = null;
  private consumer: Consumer | null = null;
  private admin: Admin | null = null;
  private logger: Logger;
  private isConnected: boolean = false;
  private enableFallback: boolean;
  private connecting: Promise<void> | null = null;

  // In-memory fallback event bus for resilience during broker outages and unit tests
  private localConsumers = new Map<string, Set<EventHandler<any>>>();
  private publishedEventsBuffer: Array<{ topic: string; event: DurableEvent<any> }> = [];

  // Metrics
  private metrics = {
    publishedCount: 0,
    consumedCount: 0,
    consumerLag: 0,
    processingLatencyMs: 0,
  };

  constructor(options: KafkaServiceOptions = {}) {
    this.logger = options.logger || pino({ name: "kafka-service" });
    this.enableFallback = options.enableFallback ?? true;

    const brokersString =
      options.brokers?.join(",") || process.env.KAFKA_BROKERS || "localhost:9092";
    const brokers = brokersString.split(",").map((b) => b.trim());

    try {
      this.kafka = new Kafka({
        clientId: options.clientId || "remote-ide-gateway",
        brokers,
        logLevel: logLevel.NOTHING,
        retry: {
          initialRetryTime: 100,
          retries: 2,
        },
      });

      this.producer = this.kafka.producer({
        allowAutoTopicCreation: true,
      });

      this.consumer = this.kafka.consumer({
        groupId: "remote-ide-gateway-group",
        allowAutoTopicCreation: true,
      });

      this.admin = this.kafka.admin();
    } catch (err) {
      this.logger.warn({ err }, "KafkaJS initialization error, operating in memory fallback");
      this.kafka = null;
    }
  }

  public async connect(): Promise<void> {
    if (this.isConnected) return;
    if (this.connecting) return this.connecting;
    this.connecting = this.connectProducer();
    try {
      await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  private async connectProducer(): Promise<void> {
    if (!this.producer) return;

    try {
      await this.producer.connect();
      this.isConnected = true;
      this.logger.info("Kafka producer connected");

      // Ensure standard topics exist
      await this.ensureTopics();
    } catch (err) {
      this.isConnected = false;
      this.logger.warn(
        "Could not connect to Kafka broker, operating in resilient memory fallback mode"
      );
    }
  }

  public async ensureTopics(): Promise<void> {
    if (!this.admin) return;

    try {
      await this.admin.connect();
      const existingTopics = await this.admin.listTopics();
      const topicsToCreate = ALL_KAFKA_TOPICS.filter((t) => !existingTopics.includes(t)).map(
        (topic) => ({
          topic,
          numPartitions: 3,
          replicationFactor: 1,
        })
      );

      if (topicsToCreate.length > 0) {
        await this.admin.createTopics({
          topics: topicsToCreate,
          waitForLeaders: false,
        });
        this.logger.info({ topics: topicsToCreate.map((t) => t.topic) }, "Created Kafka topics");
      }
      await this.admin.disconnect();
    } catch {
      // Non-fatal if topics already exist or broker is offline
    }
  }

  public isBrokerConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Publish a durable versioned event to a Kafka topic.
   * Workspace-scoped events use `workspaceId` as the partition key to guarantee ordered processing.
   */
  public async publishEvent<T extends Record<string, unknown>>(
    topic: KafkaTopic | string,
    event: DurableEvent<T>
  ): Promise<void> {
    // Determine partition key: workspaceId for workspace-scoped events, otherwise hostId/sessionId/id
    const partitionKey = event.workspaceId || event.sessionId || event.hostId || event.id;

    if (!this.isConnected && !this.enableFallback) await this.connect();
    if (this.isConnected && this.producer) {
      try {
        await this.producer.send({
          topic,
          messages: [
            {
              key: partitionKey,
              value: JSON.stringify(event),
              headers: {
                "schema-version": String(event.version),
                "event-type": event.type,
                "correlation-id": event.correlationId || "",
              },
            },
          ],
        });
        this.metrics.publishedCount++;
        return;
      } catch (err) {
        this.isConnected = false;
        this.logger.warn(
          { err, topic, eventId: event.id },
          "Failed to publish to Kafka, falling back to local bus"
        );
      }
    }

    if (!this.enableFallback)
      throw new Error("Kafka publication unavailable; retain event in outbox");
    if (this.enableFallback) {
      this.metrics.publishedCount++;
      this.publishedEventsBuffer.push({ topic, event });
      if (this.publishedEventsBuffer.length > 500) {
        this.publishedEventsBuffer.shift();
      }

      // Deliver to local subscribers asynchronously
      const handlers = this.localConsumers.get(topic);
      if (handlers) {
        for (const handler of handlers) {
          try {
            const start = Date.now();
            await handler(event);
            this.metrics.consumedCount++;
            this.metrics.processingLatencyMs = Date.now() - start;
          } catch (handlerErr) {
            this.logger.error(
              { handlerErr, eventId: event.id },
              "Error in local Kafka consumer handler"
            );
          }
        }
      }
    }
  }

  /**
   * Subscribe to a topic with an event handler.
   */
  public async subscribe<T extends Record<string, unknown>>(
    topic: KafkaTopic | string,
    handler: EventHandler<T>
  ): Promise<() => void> {
    let handlers = this.localConsumers.get(topic);
    if (!handlers) {
      handlers = new Set();
      this.localConsumers.set(topic, handlers);
    }
    handlers.add(handler as EventHandler<any>);

    // If connected to Kafka broker, wire consumer group
    if (this.isConnected && this.consumer) {
      try {
        await this.consumer.connect();
        await this.consumer.subscribe({ topic, fromBeginning: false });
        await this.consumer.run({
          eachMessage: async ({ message }) => {
            if (!message.value) return;
            try {
              const start = Date.now();
              const event = JSON.parse(message.value.toString()) as DurableEvent<T>;
              await handler(event);
              this.metrics.consumedCount++;
              this.metrics.processingLatencyMs = Date.now() - start;
            } catch (err) {
              this.logger.error({ err }, "Error processing Kafka message");
            }
          },
        });
      } catch (err) {
        this.logger.warn(
          { err, topic },
          "Failed to subscribe via KafkaJS consumer (using local bus)"
        );
      }
    }

    return () => {
      handlers?.delete(handler as EventHandler<any>);
    };
  }

  public getMetrics(): {
    publishedCount: number;
    consumedCount: number;
    consumerLag: number;
    processingLatencyMs: number;
    connected: boolean;
  } {
    return {
      publishedCount: this.metrics.publishedCount,
      consumedCount: this.metrics.consumedCount,
      consumerLag: this.metrics.consumerLag,
      processingLatencyMs: this.metrics.processingLatencyMs,
      connected: this.isConnected,
    };
  }

  public async close(): Promise<void> {
    this.isConnected = false;
    this.localConsumers.clear();
    this.publishedEventsBuffer = [];

    if (this.producer) {
      try {
        await this.producer.disconnect();
      } catch {}
      this.producer = null;
    }
    if (this.consumer) {
      try {
        await this.consumer.disconnect();
      } catch {}
      this.consumer = null;
    }
  }
}

export const kafkaService = new KafkaService({ enableFallback: process.env.NODE_ENV === "test" });
