import { FastifyPluginAsync } from "fastify";
import {
  createSuccessResponse,
  DockerLogsDtoSchema,
  DockerExecDtoSchema,
  AppError,
  ErrorCode,
  formatZodIssues,
} from "@remote-ide/shared";
import { DockerService, dockerService } from "../services/docker/docker.service.js";

export const dockerRoutes: FastifyPluginAsync<{
  dockerService?: DockerService;
}> = async (fastify, opts) => {
  const service = opts.dockerService || dockerService;

  fastify.get("/api/v1/docker/overview", async () => {
    const overview = await service.getOverview();
    return createSuccessResponse(overview);
  });

  fastify.get<{
    Querystring: { all?: string };
  }>("/api/v1/docker/containers", async (request) => {
    const all = request.query.all !== "false";
    const containers = await service.listContainers(all);
    return createSuccessResponse(containers);
  });

  fastify.post<{
    Params: { id: string };
  }>("/api/v1/docker/containers/:id/start", async (request) => {
    await service.startContainer(request.params.id);
    return createSuccessResponse({ success: true, id: request.params.id, action: "start" });
  });

  fastify.post<{
    Params: { id: string };
  }>("/api/v1/docker/containers/:id/stop", async (request) => {
    await service.stopContainer(request.params.id);
    return createSuccessResponse({ success: true, id: request.params.id, action: "stop" });
  });

  fastify.post<{
    Params: { id: string };
  }>("/api/v1/docker/containers/:id/restart", async (request) => {
    await service.restartContainer(request.params.id);
    return createSuccessResponse({ success: true, id: request.params.id, action: "restart" });
  });

  fastify.get<{
    Params: { id: string };
    Querystring: { tail?: string; timestamps?: string; since?: string };
  }>("/api/v1/docker/containers/:id/logs", async (request) => {
    const tail = request.query.tail ? parseInt(request.query.tail, 10) : 200;
    const timestamps = request.query.timestamps === "true";
    const val = DockerLogsDtoSchema.safeParse({
      containerId: request.params.id,
      tail,
      timestamps,
      since: request.query.since,
    });
    if (!val.success) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid logs parameters", {
        details: formatZodIssues(val.error.issues),
      });
    }

    const logs = await service.getContainerLogs(val.data);
    return createSuccessResponse({ containerId: request.params.id, logs });
  });

  fastify.get<{
    Params: { id: string };
  }>("/api/v1/docker/containers/:id/stats", async (request) => {
    const stats = await service.getContainerStats(request.params.id);
    return createSuccessResponse(stats);
  });

  fastify.post<{
    Params: { id: string };
    Body: { command: string[] };
  }>("/api/v1/docker/containers/:id/exec", async (request) => {
    const val = DockerExecDtoSchema.safeParse({
      containerId: request.params.id,
      command: request.body?.command,
    });
    if (!val.success) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid exec parameters", {
        details: formatZodIssues(val.error.issues),
      });
    }

    const result = await service.execContainer(val.data);
    return createSuccessResponse(result);
  });

  fastify.get("/api/v1/docker/images", async () => {
    const images = await service.listImages();
    return createSuccessResponse(images);
  });

  fastify.get("/api/v1/docker/volumes", async () => {
    const volumes = await service.listVolumes();
    return createSuccessResponse(volumes);
  });

  fastify.get("/api/v1/docker/networks", async () => {
    const networks = await service.listNetworks();
    return createSuccessResponse(networks);
  });

  fastify.get("/api/v1/docker/compose", async () => {
    const projects = await service.listComposeProjects();
    return createSuccessResponse(projects);
  });
};

