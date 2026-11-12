import "dotenv/config";
import { WorkerEnvSchema, parseEnv, DomainEventType } from "@remote-ide/shared";
import { WorkerService } from "./service.js";
import { pino } from "pino";

async function main(): Promise<void> {
  const env = parseEnv(WorkerEnvSchema, process.env);
  const logger = pino({ level: env.LOG_LEVEL });
  const worker = new WorkerService(env, logger);

  // Example handlers for foundation domain events
  worker.registerHandler(DomainEventType.HOST_CONNECTED, async (data) => {
    logger.info({ data }, "Handling host connected background event");
  });

  worker.registerHandler(DomainEventType.AUDIT_LOG_RECORDED, async (data) => {
    logger.info({ data }, "Handling audit log processing event");
  });

  await worker.start();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Worker shutting down gracefully...");
    await worker.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

if (process.env.NODE_ENV !== "test") {
  main().catch((err) => {
    console.error("Worker fatal error:", err);
    process.exit(1);
  });
}
