import "dotenv/config";
import { buildApp } from "./app.js";
import { GatewayEnvSchema, parseEnv } from "@remote-ide/shared";

async function main(): Promise<void> {
  const env = parseEnv(GatewayEnvSchema, process.env);
  const app = await buildApp();

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "Shutting down gateway server gracefully...");
    try {
      await app.close();
      app.log.info("Gateway server closed cleanly.");
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, "Error during gateway server shutdown");
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(`RemoteIDE Gateway running on http://${env.HOST}:${env.PORT}`);
    app.log.info(`API v1 prefix: http://${env.HOST}:${env.PORT}/api/v1`);
    app.log.info(`WebSocket endpoint: ws://${env.HOST}:${env.PORT}/api/v1/ws`);
  } catch (err) {
    app.log.error({ err }, "Failed to start Gateway server");
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== "test") {
  main().catch((err) => {
    console.error("Fatal startup error:", err);
    process.exit(1);
  });
}
