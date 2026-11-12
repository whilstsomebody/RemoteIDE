import { FastifyPluginAsync } from "fastify";
import { HealthStatus, createSuccessResponse, type HealthCheckResult } from "@remote-ide/shared";
import { LocalJournalService } from "../services/local-journal.service.js";
import { HostIdentityService } from "../services/host-identity.service.js";
import { WorkspaceService } from "../services/workspace.service.js";

export const healthRoutes: FastifyPluginAsync<{
  journal: LocalJournalService;
  identity: HostIdentityService;
  workspaceService: WorkspaceService;
}> = async (fastify, opts) => {
  const startTime = Date.now();

  const handleHealth = async () => {
    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
    const journalHealth = opts.journal.checkHealth();
    const hostInfo = opts.identity.getIdentity();

    const healthData: HealthCheckResult = {
      status: journalHealth.healthy ? HealthStatus.HEALTHY : HealthStatus.DEGRADED,
      service: "@remote-ide/agent",
      version: "0.1.0",
      uptimeSeconds,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development",
      components: {
        host: {
          status: HealthStatus.HEALTHY,
          details: {
            hostId: hostInfo.hostId,
            hostname: hostInfo.hostName,
            platform: hostInfo.platform,
            arch: hostInfo.arch,
          },
        },
        journal: {
          status: journalHealth.healthy ? HealthStatus.HEALTHY : HealthStatus.UNHEALTHY,
          details: {
            dbPath: journalHealth.dbPath,
            pendingEvents: journalHealth.pendingCount,
            error: journalHealth.error,
          },
        },
      },
    };

    return createSuccessResponse(healthData);
  };

  const handleReady = async () => {
    const journalHealth = opts.journal.checkHealth();
    const isReady = journalHealth.healthy;

    return createSuccessResponse({
      ready: isReady,
      service: "@remote-ide/agent",
      hostId: opts.identity.getHostId(),
      workspacesCount: opts.workspaceService.listWorkspaces().length,
      timestamp: new Date().toISOString(),
    });
  };

  fastify.get("/health", handleHealth);
  fastify.get("/api/v1/health", handleHealth);
  fastify.get("/ready", handleReady);
  fastify.get("/api/v1/ready", handleReady);
};
