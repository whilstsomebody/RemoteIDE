import { FastifyPluginAsync } from "fastify";
import { createSuccessResponse, AppError, ErrorCode } from "@remote-ide/shared";
import { DevOpsService, devOpsService } from "../services/devops/devops.service.js";

export const devopsRoutes: FastifyPluginAsync<{
  devopsService?: DevOpsService;
}> = async (fastify, opts) => {
  const service = opts.devopsService || devOpsService;

  // Overview
  fastify.get("/api/v1/devops/overview", async () => {
    const overview = await service.getOverview();
    return createSuccessResponse(overview);
  });

  // PM2 Overview
  fastify.get("/api/v1/devops/pm2", async () => {
    const pm2 = await service.getPm2Overview();
    return createSuccessResponse(pm2);
  });

  // PM2 Restart
  fastify.post<{
    Params: { id: string };
  }>("/api/v1/devops/pm2/:id/restart", async (request) => {
    await service.restartPm2(request.params.id);
    return createSuccessResponse({ success: true, id: request.params.id, action: "restart" });
  });

  // PM2 Stop
  fastify.post<{
    Params: { id: string };
  }>("/api/v1/devops/pm2/:id/stop", async (request) => {
    await service.stopPm2(request.params.id);
    return createSuccessResponse({ success: true, id: request.params.id, action: "stop" });
  });

  // Kubernetes
  fastify.get("/api/v1/devops/kubernetes", async () => {
    const k8s = await service.getKubernetesOverview();
    return createSuccessResponse(k8s);
  });

  // SSH Profiles
  fastify.get("/api/v1/devops/ssh", async () => {
    const list = service.listSshProfiles();
    return createSuccessResponse(list);
  });

  // Add SSH Profile
  fastify.post<{
    Body: { name: string; host: string; port?: number; username: string; authType?: any };
  }>("/api/v1/devops/ssh", async (request) => {
    const body = request.body;
    if (!body || !body.name || !body.host || !body.username) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "name, host, and username are required");
    }
    const profile = service.addSshProfile(body);
    return createSuccessResponse(profile);
  });

  // Delete SSH Profile
  fastify.delete<{
    Params: { id: string };
  }>("/api/v1/devops/ssh/:id", async (request) => {
    const deleted = service.deleteSshProfile(request.params.id);
    if (!deleted) {
      throw new AppError(ErrorCode.NOT_FOUND, `SSH profile ${request.params.id} not found`);
    }
    return createSuccessResponse({ deleted: true, id: request.params.id });
  });

  // Test SSH Connection
  fastify.post<{
    Params: { id: string };
  }>("/api/v1/devops/ssh/:id/test", async (request) => {
    const tested = await service.testSshConnection(request.params.id);
    return createSuccessResponse(tested);
  });
};

