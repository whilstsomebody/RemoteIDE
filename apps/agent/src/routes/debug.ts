import { FastifyPluginAsync } from "fastify";
import {
  createSuccessResponse,
  LaunchDebugDtoSchema,
  AttachDebugDtoSchema,
  SetBreakpointsDtoSchema,
  EvaluateDtoSchema,
  AppError,
  ErrorCode,
  formatZodIssues,
} from "@remote-ide/shared";
import { DapManagerService, dapManagerService } from "../services/debug/dap-manager.service.js";

export const debugRoutes: FastifyPluginAsync<{
  dapService?: DapManagerService;
}> = async (fastify, opts) => {
  const service = opts.dapService || dapManagerService;

  // List debug sessions
  fastify.get<{ Querystring: { workspaceId?: string } }>(
    "/api/v1/debug/sessions",
    async (request) => {
      const list = service.listSessions(request.query.workspaceId);
      return createSuccessResponse(list);
    }
  );

  // Get debug session details
  fastify.get<{ Params: { id: string } }>("/api/v1/debug/sessions/:id", async (request) => {
    const session = service.getSession(request.params.id);
    return createSuccessResponse(session);
  });

  // Launch debuggee
  fastify.post("/api/v1/debug/launch", async (request) => {
    const val = LaunchDebugDtoSchema.safeParse(request.body);
    if (!val.success) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid debug launch parameters", {
        details: formatZodIssues(val.error.issues),
      });
    }
    const session = await service.launch(val.data);
    return createSuccessResponse(session);
  });

  // Attach to running debuggee
  fastify.post("/api/v1/debug/attach", async (request) => {
    const val = AttachDebugDtoSchema.safeParse(request.body);
    if (!val.success) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid debug attach parameters", {
        details: formatZodIssues(val.error.issues),
      });
    }
    const session = await service.attach(val.data);
    return createSuccessResponse(session);
  });

  // Set breakpoints
  fastify.post("/api/v1/debug/breakpoints", async (request) => {
    const val = SetBreakpointsDtoSchema.safeParse(request.body);
    if (!val.success) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid breakpoint parameters", {
        details: formatZodIssues(val.error.issues),
      });
    }
    const breakpoints = await service.setBreakpoints(val.data);
    return createSuccessResponse(breakpoints);
  });

  // Execution flow controls
  fastify.post<{ Params: { id: string } }>("/api/v1/debug/:id/continue", async (request) => {
    await service.continue(request.params.id);
    return createSuccessResponse({ success: true });
  });

  fastify.post<{ Params: { id: string } }>("/api/v1/debug/:id/pause", async (request) => {
    await service.pause(request.params.id);
    return createSuccessResponse({ success: true });
  });

  fastify.post<{ Params: { id: string } }>("/api/v1/debug/:id/step-over", async (request) => {
    await service.stepOver(request.params.id);
    return createSuccessResponse({ success: true });
  });

  fastify.post<{ Params: { id: string } }>("/api/v1/debug/:id/step-in", async (request) => {
    await service.stepIn(request.params.id);
    return createSuccessResponse({ success: true });
  });

  fastify.post<{ Params: { id: string } }>("/api/v1/debug/:id/step-out", async (request) => {
    await service.stepOut(request.params.id);
    return createSuccessResponse({ success: true });
  });

  // Call stack
  fastify.get<{ Params: { id: string } }>("/api/v1/debug/:id/stack-trace", async (request) => {
    const stack = service.getStackTrace(request.params.id);
    return createSuccessResponse(stack);
  });

  // Scopes
  fastify.get<{ Params: { id: string }; Querystring: { frameId?: string } }>(
    "/api/v1/debug/:id/scopes",
    async (request) => {
      const frameId = request.query.frameId ? parseInt(request.query.frameId, 10) : 0;
      const scopes = service.getScopes(request.params.id, frameId);
      return createSuccessResponse(scopes);
    }
  );

  // Variables
  fastify.get<{ Params: { id: string }; Querystring: { variablesReference: string } }>(
    "/api/v1/debug/:id/variables",
    async (request) => {
      const refId = parseInt(request.query.variablesReference, 10);
      if (isNaN(refId)) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, "variablesReference must be a number");
      }
      const variables = await service.getVariables(request.params.id, refId);
      return createSuccessResponse(variables);
    }
  );

  // Evaluate watch expressions / REPL
  fastify.post("/api/v1/debug/evaluate", async (request) => {
    const val = EvaluateDtoSchema.safeParse(request.body);
    if (!val.success) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid evaluate parameters", {
        details: formatZodIssues(val.error.issues),
      });
    }
    const result = await service.evaluate(val.data);
    return createSuccessResponse(result);
  });

  // Stop / terminate debug session
  fastify.post<{ Params: { id: string } }>("/api/v1/debug/:id/stop", async (request) => {
    await service.stop(request.params.id);
    return createSuccessResponse({ terminated: true, id: request.params.id });
  });
};
