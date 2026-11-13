import { FastifyPluginAsync } from "fastify";
import {
  createSuccessResponse,
  CreateTerminalDtoSchema,
  TerminalResizeDtoSchema,
  AppError,
  ErrorCode,
  formatZodIssues,
} from "@remote-ide/shared";
import { TerminalService } from "../services/terminal.service.js";

export const terminalRoutes: FastifyPluginAsync<{
  terminalService: TerminalService;
}> = async (fastify, opts) => {
  const { terminalService } = opts;

  // List all terminal sessions on this host
  fastify.get("/api/v1/terminals", async () => {
    const list = terminalService.listTerminals();
    return createSuccessResponse(list);
  });

  // Query available shells and tmux capability on host
  fastify.get("/api/v1/terminals/shells", async () => {
    const shells = terminalService.getAvailableShells();
    const tmuxSupported = terminalService.isTmuxSupported();
    return createSuccessResponse({
      shells,
      tmuxSupported,
      defaultShell: shells[0] || (process.platform === "win32" ? "cmd.exe" : "/bin/sh"),
      platform: process.platform,
    });
  });

  // Create an interactive PTY session
  fastify.post("/api/v1/terminals", async (request) => {
    const validation = CreateTerminalDtoSchema.safeParse(request.body || {});
    if (!validation.success) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid terminal configuration", {
        details: formatZodIssues(validation.error.issues),
      });
    }

    const ownerId = (request.headers["x-owner-id"] as string) || "owner";
    const session = await terminalService.createTerminal(validation.data, ownerId);
    return createSuccessResponse(session);
  });

  // Get specific session metadata
  fastify.get<{ Params: { id: string } }>("/api/v1/terminals/:id", async (request) => {
    const session = terminalService.getTerminal(request.params.id);
    return createSuccessResponse(session);
  });

  // Resize terminal window dimensions
  fastify.post<{ Params: { id: string } }>("/api/v1/terminals/:id/resize", async (request) => {
    const validation = TerminalResizeDtoSchema.safeParse(request.body);
    if (!validation.success) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid terminal resize dimensions", {
        details: formatZodIssues(validation.error.issues),
      });
    }

    terminalService.resizeTerminal(request.params.id, validation.data.cols, validation.data.rows);
    return createSuccessResponse({
      resized: true,
      cols: validation.data.cols,
      rows: validation.data.rows,
    });
  });

  // Explicitly terminate shell process
  fastify.delete<{ Params: { id: string } }>("/api/v1/terminals/:id", async (request) => {
    await terminalService.closeTerminal(request.params.id);
    return createSuccessResponse({ terminated: true, id: request.params.id });
  });
};
