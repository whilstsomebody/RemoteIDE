import { FastifyPluginAsync } from "fastify";
import {
  createSuccessResponse,
  RunTestsDtoSchema,
  AppError,
  ErrorCode,
  formatZodIssues,
} from "@remote-ide/shared";
import { TestRunnerService, testRunnerService } from "../services/testing/test-runner.service.js";

export const testRoutes: FastifyPluginAsync<{
  testService?: TestRunnerService;
}> = async (fastify, opts) => {
  const service = opts.testService || testRunnerService;

  fastify.get<{ Querystring: { workspacePath?: string } }>(
    "/api/v1/tests/discover",
    async (request) => {
      const targetPath = request.query.workspacePath || process.cwd();
      const suites = service.discoverTests(targetPath);
      return createSuccessResponse(suites);
    }
  );

  fastify.post<{ Body: unknown; Querystring: { workspacePath?: string } }>(
    "/api/v1/tests/run",
    async (request) => {
      const val = RunTestsDtoSchema.safeParse(request.body);
      if (!val.success) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid test run parameters", {
          details: formatZodIssues(val.error.issues),
        });
      }
      const targetPath = request.query.workspacePath || process.cwd();
      const result = await service.runTests(val.data, targetPath);
      return createSuccessResponse(result);
    }
  );

  fastify.get<{ Querystring: { workspaceId?: string } }>(
    "/api/v1/tests/last-run",
    async (request) => {
      const wsId = request.query.workspaceId || "default";
      const result = service.getLastRun(wsId);
      return createSuccessResponse(result);
    }
  );
};

