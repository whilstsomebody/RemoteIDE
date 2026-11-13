import "dotenv/config";
import { buildAgentApp } from "./app.js";
import { AgentEnvSchema, parseEnv } from "@remote-ide/shared";

async function main(): Promise<void> {
  const env = parseEnv(AgentEnvSchema, process.env);

  // Enforce loopback interface for Phase 1
  const bindHost = "127.0.0.1";

  const {
    app,
    journal,
    watcherService,
    workspaceService,
    terminalService,
    jobManagerService,
    terminalWsServer,
    tunnelTransport,
    processManagerService,
    syncClient,
  } = await buildAgentApp({
    journalPath: env.SQLITE_JOURNAL_PATH,
    allowedPaths: env.ALLOWED_PROJECT_ROOTS.split(","),
  });

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "Shutting down host agent cleanly...");
    try {
      if (tunnelTransport) {
        await tunnelTransport.disconnect();
      }
      terminalWsServer?.close();
      syncClient.stop();
      await terminalService.shutdownAll();
      await jobManagerService.shutdownAll();
      processManagerService.shutdown();
      watcherService.stopAll();
      await app.close();
      workspaceService.close();
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
    await app.listen({ port: env.PORT, host: bindHost });
    app.log.info(
      `RemoteIDE Host Agent running strictly on http://${bindHost}:${env.PORT} (loopback only)`
    );

    // Start outbound persistent tunnel connection to remote gateway
    if (tunnelTransport) {
      void tunnelTransport.connect();
      app.log.info("Host agent reverse tunnel outbound transport initialized.");
    }
    syncClient.start();
    app.log.info(`Agent Health: http://${bindHost}:${env.PORT}/api/v1/health`);
    app.log.info(`Agent Ready: http://${bindHost}:${env.PORT}/api/v1/ready`);
    app.log.info(`Agent Workspaces: http://${bindHost}:${env.PORT}/api/v1/workspaces`);
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
