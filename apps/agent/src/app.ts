import fastify, { FastifyInstance, FastifyServerOptions } from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import { AppError, ErrorCode, createErrorResponse } from "@remote-ide/shared";
import { healthRoutes } from "./routes/health.js";
import { capabilitiesRoutes } from "./routes/capabilities.js";
import { workspaceRoutes } from "./routes/workspaces.js";
import { fileRoutes } from "./routes/files.js";
import { terminalRoutes } from "./routes/terminals.js";
import { jobRoutes } from "./routes/jobs.js";
import { gitRoutes } from "./routes/git.js";
import { processRoutes } from "./routes/processes.js";
import { portRoutes } from "./routes/ports.js";
import { apiClientRoutes } from "./routes/api-client.js";
import { LocalJournalService } from "./services/local-journal.service.js";
import { HostIdentityService } from "./services/host-identity.service.js";
import { WorkspaceService } from "./services/workspace.service.js";
import { FilesystemService } from "./services/filesystem.service.js";
import { WatcherService } from "./services/watcher.service.js";
import {
  TerminalService,
  terminalService as defaultTerminalService,
} from "./services/terminal.service.js";
import {
  JobManagerService,
  jobManagerService as defaultJobManagerService,
} from "./services/job-manager.service.js";
import { GitService, gitService as defaultGitService } from "./services/git.service.js";
import {
  ProcessManagerService,
  processManagerService as defaultProcessManagerService,
} from "./services/process-manager.service.js";
import {
  PortForwardingService,
  portForwardingService as defaultPortForwardingService,
} from "./services/port-forwarding.service.js";
import {
  ApiClientService,
  apiClientService as defaultApiClientService,
} from "./services/api-client.service.js";
import { SyncClientService } from "./services/sync-client.service.js";
import { TerminalWsServer } from "./services/terminal-ws.service.js";
import { ITunnelTransport, RelayTunnelTransport } from "./services/tunnel-transport.js";

export interface AgentAppOptions extends FastifyServerOptions {
  journalPath?: string;
  dataDir?: string;
  allowedPaths?: string[];
  gatewayWsUrl?: string;
  enableTunnel?: boolean;
}

export interface AgentContext {
  app: FastifyInstance;
  journal: LocalJournalService;
  identity: HostIdentityService;
  workspaceService: WorkspaceService;
  fsService: FilesystemService;
  watcherService: WatcherService;
  terminalService: TerminalService;
  jobManagerService: JobManagerService;
  gitService: GitService;
  processManagerService: ProcessManagerService;
  portForwardingService: PortForwardingService;
  apiClientService: ApiClientService;
  syncClient: SyncClientService;
  terminalWsServer?: TerminalWsServer;
  tunnelTransport?: ITunnelTransport;
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
  const watcherService = new WatcherService(journal);
  const fsService = new FilesystemService(workspaceService, journal, { watcherService });
  const syncClient = new SyncClientService({
    gatewayHttpUrl: process.env.GATEWAY_HTTP_URL || "http://localhost:4000",
    hostId: identity.getHostId(),
    journalService: journal,
  });

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
  await app.register(terminalRoutes, { terminalService: defaultTerminalService });
  await app.register(jobRoutes, { jobManagerService: defaultJobManagerService });
  await app.register(gitRoutes, { gitService: defaultGitService });
  await app.register(processRoutes, { processManagerService: defaultProcessManagerService });
  await app.register(portRoutes, { portForwardingService: defaultPortForwardingService });
  await app.register(apiClientRoutes, { apiClientService: defaultApiClientService });

  // Terminal WebSocket server for direct local connections
  const terminalWsServer = new TerminalWsServer(app.server, defaultTerminalService);
  terminalWsServer.init();

  // Outbound Reverse Tunnel Transport (Local Relay or Cloud Tunnel)
  let tunnelTransport: ITunnelTransport | undefined;
  if (opts.enableTunnel !== false) {
    const gatewayWsUrl =
      opts.gatewayWsUrl || process.env.GATEWAY_WS_URL || "ws://127.0.0.1:4000/api/v1/tunnel/agent";

    tunnelTransport = new RelayTunnelTransport({
      gatewayWsUrl,
      hostId: identity.getHostId(),
      app,
    });
  }

  return {
    app,
    journal,
    identity,
    workspaceService,
    fsService,
    watcherService,
    terminalService: defaultTerminalService,
    jobManagerService: defaultJobManagerService,
    gitService: defaultGitService,
    processManagerService: defaultProcessManagerService,
    portForwardingService: defaultPortForwardingService,
    apiClientService: defaultApiClientService,
    syncClient,
    terminalWsServer,
    tunnelTransport,
  };
}
