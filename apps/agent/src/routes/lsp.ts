import { FastifyPluginAsync } from "fastify";
import {
  createSuccessResponse,
  LspTextDocumentDidOpenDtoSchema,
  LspTextDocumentDidChangeDtoSchema,
  LspTextDocumentDidSaveDtoSchema,
  LspTextDocumentDidCloseDtoSchema,
  LspCompletionDtoSchema,
  LspHoverDtoSchema,
  LspDefinitionDtoSchema,
  LspReferencesDtoSchema,
  LspRenameDtoSchema,
  LspSignatureHelpDtoSchema,
  LspCodeActionDtoSchema,
  LspFormatDtoSchema,
  AppError,
  ErrorCode,
  formatZodIssues,
} from "@remote-ide/shared";
import { LspManagerService, lspManagerService } from "../services/lsp/lsp-manager.service.js";

export const lspRoutes: FastifyPluginAsync<{
  lspService?: LspManagerService;
}> = async (fastify, opts) => {
  const service = opts.lspService || lspManagerService;

  // 1. Language Servers & Toolchain Detection
  fastify.get("/api/v1/lsp/servers", async (request) => {
    const servers = service.detectToolchain();
    const query = request.query as Record<string, string | undefined>;
    const wsPath = query.workspacePath || process.cwd();
    const projectLang = service.detectWorkspaceLanguage(wsPath);

    return createSuccessResponse({
      servers,
      projectLanguage: projectLang.primaryLanguage,
      detectedLanguages: projectLang.detectedLanguages,
    });
  });

  fastify.post<{ Params: { id: string }; Body: { workspaceId?: string } }>(
    "/api/v1/lsp/servers/:id/restart",
    async (request) => {
      const serverId = request.params.id;
      const workspaceId = request.body?.workspaceId || "default";
      await service.restartServer(serverId, workspaceId);
      return createSuccessResponse({ restarted: true, serverId });
    }
  );

  // 2. Document Sync
  fastify.post("/api/v1/lsp/open", async (request) => {
    const val = LspTextDocumentDidOpenDtoSchema.safeParse(request.body);
    if (!val.success) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid open parameters", {
        details: formatZodIssues(val.error.issues),
      });
    }
    service.onDidOpen(val.data);
    return createSuccessResponse({ success: true });
  });

  fastify.post("/api/v1/lsp/change", async (request) => {
    const val = LspTextDocumentDidChangeDtoSchema.safeParse(request.body);
    if (!val.success) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid change parameters", {
        details: formatZodIssues(val.error.issues),
      });
    }
    service.onDidChange(val.data);
    return createSuccessResponse({ success: true });
  });

  fastify.post("/api/v1/lsp/save", async (request) => {
    const val = LspTextDocumentDidSaveDtoSchema.safeParse(request.body);
    if (!val.success) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid save parameters", {
        details: formatZodIssues(val.error.issues),
      });
    }
    service.onDidSave(val.data);
    return createSuccessResponse({ success: true });
  });

  fastify.post("/api/v1/lsp/close", async (request) => {
    const val = LspTextDocumentDidCloseDtoSchema.safeParse(request.body);
    if (!val.success) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid close parameters", {
        details: formatZodIssues(val.error.issues),
      });
    }
    service.onDidClose(val.data);
    return createSuccessResponse({ success: true });
  });

  // 3. Autocompletion
  fastify.post("/api/v1/lsp/completion", async (request) => {
    const val = LspCompletionDtoSchema.safeParse(request.body);
    if (!val.success) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid completion parameters", {
        details: formatZodIssues(val.error.issues),
      });
    }
    const items = service.getCompletions(val.data);
    return createSuccessResponse(items);
  });

  // 4. Hover
  fastify.post("/api/v1/lsp/hover", async (request) => {
    const val = LspHoverDtoSchema.safeParse(request.body);
    if (!val.success) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid hover parameters", {
        details: formatZodIssues(val.error.issues),
      });
    }
    const hover = service.getHover(val.data);
    return createSuccessResponse(hover);
  });

  // 5. Definition & References
  fastify.post("/api/v1/lsp/definition", async (request) => {
    const val = LspDefinitionDtoSchema.safeParse(request.body);
    if (!val.success) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid definition parameters", {
        details: formatZodIssues(val.error.issues),
      });
    }
    const defs = service.getDefinition(val.data);
    return createSuccessResponse(defs);
  });

  fastify.post("/api/v1/lsp/references", async (request) => {
    const val = LspReferencesDtoSchema.safeParse(request.body);
    if (!val.success) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid references parameters", {
        details: formatZodIssues(val.error.issues),
      });
    }
    const refs = service.getReferences(val.data);
    return createSuccessResponse(refs);
  });

  // 6. Rename
  fastify.post("/api/v1/lsp/rename", async (request) => {
    const val = LspRenameDtoSchema.safeParse(request.body);
    if (!val.success) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid rename parameters", {
        details: formatZodIssues(val.error.issues),
      });
    }
    const edit = service.rename(val.data);
    return createSuccessResponse(edit);
  });

  // 7. Symbols
  fastify.get<{ Querystring: { workspaceId: string; path: string } }>(
    "/api/v1/lsp/symbols/document",
    async (request) => {
      const { workspaceId, path } = request.query;
      if (!workspaceId || !path) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, "workspaceId and path are required");
      }
      const symbols = service.getDocumentSymbols(workspaceId, path);
      return createSuccessResponse(symbols);
    }
  );

  // 8. Signature Help
  fastify.post("/api/v1/lsp/signature-help", async (request) => {
    const val = LspSignatureHelpDtoSchema.safeParse(request.body);
    if (!val.success) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid signature help parameters", {
        details: formatZodIssues(val.error.issues),
      });
    }
    const help = service.getSignatureHelp(val.data);
    return createSuccessResponse(help);
  });

  // 9. Diagnostics
  fastify.get<{ Querystring: { workspaceId: string; path: string } }>(
    "/api/v1/lsp/diagnostics",
    async (request) => {
      const { workspaceId, path } = request.query;
      if (!workspaceId || !path) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, "workspaceId and path are required");
      }
      const diagnostics = service.getDiagnostics(workspaceId, path);
      return createSuccessResponse(diagnostics);
    }
  );

  // 10. Code Actions
  fastify.post("/api/v1/lsp/code-action", async (request) => {
    const val = LspCodeActionDtoSchema.safeParse(request.body);
    if (!val.success) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid code action parameters", {
        details: formatZodIssues(val.error.issues),
      });
    }
    const actions = service.getCodeActions(val.data);
    return createSuccessResponse(actions);
  });

  // 11. Formatting
  fastify.post("/api/v1/lsp/format", async (request) => {
    const val = LspFormatDtoSchema.safeParse(request.body);
    if (!val.success) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid format parameters", {
        details: formatZodIssues(val.error.issues),
      });
    }
    const edits = service.formatDocument(val.data);
    return createSuccessResponse(edits);
  });
};
