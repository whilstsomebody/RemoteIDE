import "dotenv/config";
import { buildAgentApp } from "./app.js";
import { AgentEnvSchema, parseEnv } from "@remote-ide/shared";

async function main(): Promise<void> {
  const env = parseEnv(AgentEnvSchema, process.env);
  const { app, journal } = await buildAgentApp({
    journalPath: env.SQLITE_JOURNAL_PATH,
    allowedPaths: env.ALLOWED_PROJECT_ROOTS.split(","),
  });

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "Shutting down host agent cleanly...");
    try {
      await app.close();
      journal.close();
      app.log.info("Host agent stopped cleanly.");
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, "Error during host agent shutdown");
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(`RemoteIDE Host Agent running on http://${env.HOST}:${env.PORT}`);
    app.log.info(`Agent Health: http://${env.HOST}:${env.PORT}/api/v1/health`);
    app.log.info(`Agent Capabilities: http://${env.HOST}:${env.PORT}/api/v1/capabilities`);
  } catch (err) {
    app.log.error({ err }, "Failed to start Host Agent server");
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== "test") {
  main().catch((err) => {
    console.error("Fatal startup error in agent:", err);
    process.exit(1);
  });
}

