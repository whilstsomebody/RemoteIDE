import { FastifyPluginAsync } from "fastify";
import {
  createSuccessResponse,
  AppError,
  ErrorCode,
  WriteFileDtoSchema,
  CreateFileDtoSchema,
  MoveFileDtoSchema,
  formatZodIssues,
} from "@remote-ide/shared";
import { FilesystemService } from "../services/filesystem.service.js";
import { LocalJournalService } from "../services/local-journal.service.js";

export const fileRoutes: FastifyPluginAsync<{
  fsService: FilesystemService;
  journalService: LocalJournalService;
}> = async (fastify, opts) => {
  // 1. List directory tree
  fastify.get<{
    Params: { workspaceId: string };
    Querystring: { path?: string; depth?: string };
  }>("/api/v1/workspaces/:workspaceId/files", async (request) => {
    const depth = request.query.depth ? parseInt(request.query.depth, 10) : 1;
    const tree = opts.fsService.listDirectory(
      request.params.workspaceId,
      request.query.path ?? "",
      isNaN(depth) ? 1 : depth
    );
    return createSuccessResponse(tree);
  });

  // 2. File stat metadata
  fastify.get<{
    Params: { workspaceId: string };
    Querystring: { path: string };
  }>("/api/v1/workspaces/:workspaceId/files/stat", async (request) => {
    if (!request.query.path) {
      throw new AppError(ErrorCode.BAD_REQUEST, "Query parameter 'path' is required");
    }
    const stat = opts.fsService.getFileStat(request.params.workspaceId, request.query.path);
    return createSuccessResponse(stat);
  });

  // 3. Read file contents
  fastify.get<{
    Params: { workspaceId: string };
    Querystring: { path: string; encoding?: "utf-8" | "base64" };
  }>("/api/v1/workspaces/:workspaceId/files/read", async (request) => {
    if (!request.query.path) {
      throw new AppError(ErrorCode.BAD_REQUEST, "Query parameter 'path' is required");
    }
    const file = opts.fsService.readFile(
      request.params.workspaceId,
      request.query.path,
      request.query.encoding ?? "utf-8"
    );
    return createSuccessResponse(file);
  });

  // 4. Save file contents (atomic with optional ETag check)
  fastify.put<{
    Params: { workspaceId: string };
  }>("/api/v1/workspaces/:workspaceId/files/write", async (request) => {
    const validation = WriteFileDtoSchema.safeParse(request.body);
    if (!validation.success) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid file write payload", {
        details: formatZodIssues(validation.error.issues),
      });
    }

    const { path, content, encoding, expectedETag, createParents } = validation.data;
    const result = opts.fsService.writeFile(request.params.workspaceId, path, content, {
      encoding,
      expectedETag,
      createParents,
    });
    return createSuccessResponse(result);
  });

  // 5. Create new file or directory
  fastify.post<{
    Params: { workspaceId: string };
  }>("/api/v1/workspaces/:workspaceId/files/create", async (request) => {
    const validation = CreateFileDtoSchema.safeParse(request.body);
    if (!validation.success) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid create file payload", {
        details: formatZodIssues(validation.error.issues),
      });
    }

    const { path, type, initialContent } = validation.data;
    const result = opts.fsService.createItem(
      request.params.workspaceId,
      path,
      type,
      initialContent ?? ""
    );
    return createSuccessResponse(result);
  });

  // 6. Rename or move file / directory
  fastify.post<{
    Params: { workspaceId: string };
  }>("/api/v1/workspaces/:workspaceId/files/move", async (request) => {
    const validation = MoveFileDtoSchema.safeParse(request.body);
    if (!validation.success) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid move file payload", {
        details: formatZodIssues(validation.error.issues),
      });
    }

    const { fromPath, toPath, overwrite } = validation.data;
    const result = opts.fsService.moveItem(request.params.workspaceId, fromPath, toPath, overwrite);
    return createSuccessResponse(result);
  });

  // 7. Delete file or directory
  fastify.delete<{
    Params: { workspaceId: string };
    Querystring: { path?: string; recursive?: string };
    Body?: { path?: string; recursive?: boolean };
  }>("/api/v1/workspaces/:workspaceId/files", async (request) => {
    const targetPath = request.query.path || request.body?.path;
    const recursive = request.query.recursive === "true" || request.body?.recursive === true;

    if (!targetPath) {
      throw new AppError(ErrorCode.BAD_REQUEST, "Parameter 'path' is required for delete");
    }

    const result = opts.fsService.deleteItem(request.params.workspaceId, targetPath, recursive);
    return createSuccessResponse(result);
  });

  // 8. Search filenames and file contents
  fastify.get<{
    Params: { workspaceId: string };
    Querystring: {
      query: string;
      type?: "filename" | "content";
      isRegex?: string;
      caseSensitive?: string;
      maxResults?: string;
    };
  }>("/api/v1/workspaces/:workspaceId/files/search", async (request) => {
    if (!request.query.query) {
      throw new AppError(ErrorCode.BAD_REQUEST, "Query parameter 'query' is required");
    }

    const searchResults = opts.fsService.searchFiles(request.params.workspaceId, {
      query: request.query.query,
      type: request.query.type ?? "filename",
      isRegex: request.query.isRegex === "true",
      caseSensitive: request.query.caseSensitive === "true",
      maxResults: request.query.maxResults ? parseInt(request.query.maxResults, 10) : 50,
    });

    return createSuccessResponse(searchResults);
  });

  // 9. Get local change journal entries for this workspace
  fastify.get<{
    Params: { workspaceId: string };
    Querystring: { limit?: string };
  }>("/api/v1/workspaces/:workspaceId/journal", async (request) => {
    const limit = request.query.limit ? parseInt(request.query.limit, 10) : 50;
    const entries = opts.journalService.getWorkspaceEntries(
      request.params.workspaceId,
      isNaN(limit) ? 50 : limit
    );
    return createSuccessResponse(entries);
  });
};
