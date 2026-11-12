import { pino, Logger } from "pino";
import { WorkerEnv, DomainEventType, type EventEnvelope } from "@remote-ide/shared";

export type JobHandler<T = unknown> = (data: T) => Promise<void>;

export class WorkerService {
  private isRunning: boolean = false;
  private logger: Logger;
  private handlers: Map<string, JobHandler[]> = new Map();
  private env: WorkerEnv;
  private processedCount: number = 0;

  constructor(env: WorkerEnv, logger?: Logger) {
    this.env = env;
    this.logger = logger || pino({ level: env.LOG_LEVEL });
  }

  public registerHandler<T = unknown>(
    eventType: DomainEventType | string,
    handler: JobHandler<T>
  ): void {
    const list = this.handlers.get(eventType) || [];
    list.push(handler as JobHandler);
    this.handlers.set(eventType, list);
    this.logger.debug({ eventType }, "Registered worker event handler");
  }

  public async processEvent<T = unknown>(event: EventEnvelope<T>): Promise<void> {
    const handlers = this.handlers.get(event.type) || [];
    this.logger.info(
      {
        eventId: event.id,
        eventType: event.type,
        source: event.source,
        handlersCount: handlers.length,
      },
      "Processing domain event"
    );

    for (const handler of handlers) {
      try {
        await handler(event.data);
        this.processedCount++;
      } catch (err) {
        this.logger.error(
          { err, eventId: event.id, eventType: event.type },
          "Failed to process event with handler"
        );
      }
    }
  }

  public async start(): Promise<void> {
    this.isRunning = true;
    this.logger.info(
      { concurrency: this.env.CONCURRENCY, nodeEnv: this.env.NODE_ENV },
      "Worker service started"
    );
  }

  public async stop(): Promise<void> {
    this.isRunning = false;
    this.logger.info("Worker service stopped cleanly");
  }

  public getStatus(): { isRunning: boolean; processedCount: number; registeredTypes: string[] } {
    return {
      isRunning: this.isRunning,
      processedCount: this.processedCount,
      registeredTypes: Array.from(this.handlers.keys()),
    };
  }
}
