import { FastifyPluginAsync } from "fastify";
import {
  createSuccessResponse,
  ProblemFilterDtoSchema,
  AppError,
  ErrorCode,
  formatZodIssues,
} from "@remote-ide/shared";
import { ProblemsService, problemsService } from "../services/problems/problems.service.js";

export const problemsRoutes: FastifyPluginAsync<{
  problemsService?: ProblemsService;
}> = async (fastify, opts) => {
  const service = opts.problemsService || problemsService;

  fastify.get<{
    Querystring: {
      workspaceId?: string;
      filePath?: string;
      severity?: string;
      source?: string;
      query?: string;
    };
  }>("/api/v1/problems", async (request) => {
    const wsId = request.query.workspaceId || "default";
    const filter = {
      workspaceId: wsId,
      filePath: request.query.filePath,
      severity: request.query.severity as any,
      source: request.query.source as any,
      query: request.query.query,
    };

    const val = ProblemFilterDtoSchema.safeParse(filter);
    if (!val.success) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid problem filter parameters", {
        details: formatZodIssues(val.error.issues),
      });
    }

    const res = service.getProblems(val.data);
    return createSuccessResponse(res);
  });

  fastify.post("/api/v1/problems", async (request) => {
    const body = request.body as Record<string, any>;
    if (!body || !body.workspaceId || !body.filePath || !body.message) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "workspaceId, filePath, and message required");
    }

    const recorded = service.recordProblem({
      workspaceId: body.workspaceId,
      filePath: body.filePath,
      line: body.line || 1,
      col: body.col || 1,
      message: body.message,
      severity: body.severity || "error",
      source: body.source || "build",
      code: body.code,
      relatedInformation: body.relatedInformation,
    });

    return createSuccessResponse(recorded);
  });
};
