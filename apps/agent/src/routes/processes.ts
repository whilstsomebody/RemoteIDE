import { FastifyPluginAsync } from "fastify";
import {
  createSuccessResponse,
  createErrorResponse,
  ErrorCode,
  StartProcessDtoSchema,
} from "@remote-ide/shared";
import {
  ProcessManagerService,
  processManagerService as defaultProcessManagerService,
} from "../services/process-manager.service.js";

export const processRoutes: FastifyPluginAsync<{
  processManagerService?: ProcessManagerService;
}> = async (fastify, opts) => {
  const service = opts.processManagerService || defaultProcessManagerService;

  // List managed processes
  fastify.get("/api/v1/processes", async (req) => {
    const workspaceId = (req.query as any)?.workspaceId as string | undefined;
    const processes = await service.listProcesses(workspaceId);
    return createSuccessResponse(processes);
  });

  // Get single process
  fastify.get("/api/v1/processes/:id", async (req) => {
    const { id } = req.params as { id: string };
    const process = await service.getProcess(id);
    return createSuccessResponse(process);
  });

  // Get process logs
  fastify.get("/api/v1/processes/:id/logs", async (req) => {
    const { id } = req.params as { id: string };
    const logs = service.getLogs(id);
    return createSuccessResponse(logs);
  });

  // Start process
  fastify.post("/api/v1/processes", async (req, reply) => {
    const parse = StartProcessDtoSchema.safeParse(req.body);
    if (!parse.success) {
      return reply
        .status(400)
        .send(createErrorResponse(ErrorCode.VALIDATION_ERROR, parse.error.message));
    }
    const proc = await service.startProcess(parse.data);
    return createSuccessResponse(proc);
  });

  // Stop process
  fastify.post("/api/v1/processes/:id/stop", async (req) => {
    const { id } = req.params as { id: string };
    const proc = await service.stopProcess(id);
    return createSuccessResponse(proc);
  });

  // Restart process
  fastify.post("/api/v1/processes/:id/restart", async (req) => {
    const { id } = req.params as { id: string };
    const proc = await service.restartProcess(id);
    return createSuccessResponse(proc);
  });
};
