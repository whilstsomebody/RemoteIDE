import { FastifyPluginAsync } from "fastify";
import {
  createSuccessResponse,
  CreateJobDtoSchema,
  AppError,
  ErrorCode,
  formatZodIssues,
} from "@remote-ide/shared";
import { JobManagerService } from "../services/job-manager.service.js";

export const jobRoutes: FastifyPluginAsync<{
  jobManagerService: JobManagerService;
}> = async (fastify, opts) => {
  const { jobManagerService } = opts;

  fastify.get("/api/v1/jobs", async () => {
    const list = jobManagerService.listJobs();
    return createSuccessResponse(list);
  });

  fastify.post("/api/v1/jobs", async (request) => {
    const validation = CreateJobDtoSchema.safeParse(request.body);
    if (!validation.success) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid job creation parameters", {
        details: formatZodIssues(validation.error.issues),
      });
    }

    const ownerId = (request.headers["x-owner-id"] as string) || "owner";
    const job = await jobManagerService.createJob(validation.data, ownerId);
    return createSuccessResponse(job);
  });

  fastify.get<{ Params: { id: string } }>("/api/v1/jobs/:id", async (request) => {
    const job = jobManagerService.getJob(request.params.id);
    return createSuccessResponse(job);
  });

  fastify.get<{ Params: { id: string } }>("/api/v1/jobs/:id/logs", async (request) => {
    const logs = jobManagerService.getJobLogs(request.params.id);
    return createSuccessResponse(logs);
  });

  fastify.post<{ Params: { id: string }; Body: { reason?: string } }>(
    "/api/v1/jobs/:id/cancel",
    async (request) => {
      const reason = request.body?.reason || "Cancelled by user";
      const job = await jobManagerService.cancelJob(request.params.id, reason);
      return createSuccessResponse(job);
    }
  );

  fastify.post<{ Params: { id: string } }>("/api/v1/jobs/:id/retry", async (request) => {
    const ownerId = (request.headers["x-owner-id"] as string) || "owner";
    const job = await jobManagerService.retryJob(request.params.id, ownerId);
    return createSuccessResponse(job);
  });
};
