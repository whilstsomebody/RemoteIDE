import { FastifyPluginAsync } from "fastify";
import {
  createSuccessResponse,
  RegisterWorkspaceDtoSchema,
  AppError,
  ErrorCode,
  formatZodIssues,
} from "@remote-ide/shared";
import { WorkspaceService } from "../services/workspace.service.js";
import { WatcherService } from "../services/watcher.service.js";

export const workspaceRoutes: FastifyPluginAsync<{
  workspaceService: WorkspaceService;
  watcherService: WatcherService;
}> = async (fastify, opts) => {
  // List all registered workspaces
  fastify.get("/api/v1/workspaces", async () => {
    const list = opts.workspaceService.listWorkspaces();
    return createSuccessResponse(list);
  });

  // Get active workspace
  fastify.get("/api/v1/workspaces/active", async () => {
    const active = opts.workspaceService.getActiveWorkspace();
    return createSuccessResponse(active);
  });

  // Register a new workspace
  fastify.post("/api/v1/workspaces/register", async (request) => {
    const validation = RegisterWorkspaceDtoSchema.safeParse(request.body);
    if (!validation.success) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid workspace registration data", {
        details: formatZodIssues(validation.error.issues),
      });
    }

    const { name, paths } = validation.data;
    const workspace = opts.workspaceService.registerWorkspace(name, paths);

    // Start watching workspace for external changes
    opts.watcherService.watchWorkspace(workspace);

    return createSuccessResponse(workspace);
  });

  // Get specific workspace by ID
  fastify.get<{ Params: { id: string } }>("/api/v1/workspaces/:id", async (request) => {
    const workspace = opts.workspaceService.getWorkspace(request.params.id);
    return createSuccessResponse(workspace);
  });

  // Open / switch active workspace
  fastify.post<{ Params: { id: string } }>("/api/v1/workspaces/:id/open", async (request) => {
    const workspace = opts.workspaceService.setActiveWorkspace(request.params.id);
    opts.watcherService.watchWorkspace(workspace);
    return createSuccessResponse(workspace);
  });

  // Remove workspace from RemoteIDE (does NOT delete files on disk)
  fastify.delete<{ Params: { id: string } }>("/api/v1/workspaces/:id", async (request) => {
    opts.watcherService.unwatchWorkspace(request.params.id);
    opts.workspaceService.removeWorkspace(request.params.id);
    return createSuccessResponse({ removed: true, id: request.params.id });
  });
};
