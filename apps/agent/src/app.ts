import fastify, { FastifyInstance, FastifyServerOptions } from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import { healthRoutes } from "./routes/health.js";
import { capabilitiesRoutes } from "./routes/capabilities.js";
import { HostLocalJournal } from "./journal/sqlite-journal.js";

export interface AgentAppOptions extends FastifyServerOptions {
  journalPath?: string;
  allowedPaths?: string[];
}

export async function buildAgentApp(
  opts: AgentAppOptions = {}
): Promise<{ app: FastifyInstance; journal: HostLocalJournal }> {
  const app = fastify({
    logger: {
      level: process.env.LOG_LEVEL || "info",
    },
    ...opts,
  });

  const journal = new HostLocalJournal(
    opts.journalPath || process.env.SQLITE_JOURNAL_PATH || ":memory:"
  );
  const allowedPaths =
    opts.allowedPaths ||
    (process.env.ALLOWED_PROJECT_ROOTS
      ? process.env.ALLOWED_PROJECT_ROOTS.split(",")
      : [process.cwd()]);

  await app.register(sensible);
  await app.register(cors, {
    origin: "*",
  });

  await app.register(healthRoutes, { journal });
  await app.register(capabilitiesRoutes, { allowedPaths });

  return { app, journal };
}
