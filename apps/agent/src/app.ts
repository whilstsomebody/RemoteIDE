import fastify, { FastifyInstance, FastifyServerOptions } from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import { AppError, ErrorCode, createErrorResponse } from "@remote-ide/shared";
import { healthRoutes } from "./routes/health.js";
import { capabilitiesRoutes } from "./routes/capabilities.js";
import { workspaceRoutes } from "./routes/workspaces.js";
import { fileRoutes } from "./routes/files.js";
import { LocalJournalService } from "./services/local-journal.service.js";
import { HostIdentityService } from "./services/host-identity.service.js";
import { WorkspaceService } from "./services/workspace.service.js";
import { FilesystemService } from "./services/filesystem.service.js";
import { WatcherService } from "./services/watcher.service.js";

export interface AgentAppOptions extends FastifyServerOptions {
  journalPath?: string;
  dataDir?: string;
  allowedPaths?: string[];
}

export interface AgentContext {
  app: FastifyInstance;
  journal: LocalJournalService;
  identity: HostIdentityService;
  workspaceService: WorkspaceService;
  fsService: FilesystemService;
  watcherService: WatcherService;
}

export async function buildAgentApp(opts: AgentAppOptions = {}): Promise<AgentContext> {
  const app = fastify({
    logger: {
      level: process.env.LOG_LEVEL || "info",
    },
    ...opts,
  });

  const dataDir = opts.dataDir || "./data";
  const journalPath =
    opts.journalPath || process.env.SQLITE_JOURNAL_PATH || `${dataDir}/agent-journal.sqlite`;

  const identity = new HostIdentityService(dataDir);
  const journal = new LocalJournalService(journalPath);
  const workspaceService = new WorkspaceService(journalPath);
  const fsService = new FilesystemService(workspaceService, journal);
  const watcherService = new WatcherService(journal);

  // Auto-watch any already registered workspaces on boot
  for (const ws of workspaceService.listWorkspaces()) {
    watcherService.watchWorkspace(ws);
  }

  // Centralized exception handling
  app.setErrorHandler((rawError, request, reply) => {
    request.log.error({ err: rawError, url: request.raw.url }, "Host Agent error");

    if (rawError instanceof AppError) {
      return reply.status(rawError.statusCode).send(
        createErrorResponse(rawError.code, rawError.message, {
          details: rawError.details,
        })
      );
    }

    const statusCode = (rawError as { statusCode?: number }).statusCode ?? 500;
    const message = (rawError as { message?: string }).message || "Internal Host Agent error";

    return reply
      .status(statusCode)
      .send(createErrorResponse(ErrorCode.INTERNAL_SERVER_ERROR, message));
  });

  await app.register(sensible);
  await app.register(cors, {
    origin: [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://localhost:4000",
      "http://127.0.0.1:4000",
    ],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });

  await app.register(healthRoutes, { journal, identity, workspaceService });
  await app.register(capabilitiesRoutes, {
    allowedPaths: opts.allowedPaths || [process.cwd()],
  });
  await app.register(workspaceRoutes, { workspaceService, watcherService });
  await app.register(fileRoutes, { fsService, journalService: journal });

  return {
    app,
    journal,
    identity,
    workspaceService,
    fsService,
    watcherService,
  };
}
