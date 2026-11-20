import { z } from "zod";

// --- Language Server Registry & Status ---

export enum LanguageServerStatus {
  STOPPED = "stopped",
  STARTING = "starting",
  RUNNING = "running",
  FAILED = "failed",
}

export const SupportedFeaturesSchema = z.object({
  completion: z.boolean().default(true),
  hover: z.boolean().default(true),
  definition: z.boolean().default(true),
  references: z.boolean().default(true),
  rename: z.boolean().default(true),
  documentSymbol: z.boolean().default(true),
  workspaceSymbol: z.boolean().default(true),
  signatureHelp: z.boolean().default(true),
  diagnostics: z.boolean().default(true),
  codeAction: z.boolean().default(true),
  formatting: z.boolean().default(true),
});
export type SupportedFeatures = z.infer<typeof SupportedFeaturesSchema>;

export const LanguageServerMetadataSchema = z.object({
  id: z.string(),
  name: z.string(),
  languages: z.array(z.string()),
  extensions: z.array(z.string()),
  command: z.string(),
  args: z.array(z.string()).default([]),
  isInstalled: z.boolean(),
  runtimeAvailable: z.boolean(),
  runtimeName: z.string(),
  status: z.nativeEnum(LanguageServerStatus),
  supportedFeatures: SupportedFeaturesSchema,
  lastError: z.string().optional(),
  crashCount: z.number().int().default(0),
  memoryUsageMb: z.number().optional(),
  pid: z.number().optional(),
});
export type LanguageServerMetadata = z.infer<typeof LanguageServerMetadataSchema>;

// --- Positions & Ranges ---

export const LspPositionSchema = z.object({
  line: z.number().int().nonnegative(), // 0-based
  character: z.number().int().nonnegative(), // 0-based
});
export type LspPosition = z.infer<typeof LspPositionSchema>;

export const LspRangeSchema = z.object({
  start: LspPositionSchema,
  end: LspPositionSchema,
});
export type LspRange = z.infer<typeof LspRangeSchema>;

export const LspLocationSchema = z.object({
  uri: z.string(),
  path: z.string(),
  range: LspRangeSchema,
});
export type LspLocation = z.infer<typeof LspLocationSchema>;

// --- Document Synchronization ---

export const LspTextDocumentDidOpenDtoSchema = z.object({
  workspaceId: z.string().min(1),
  path: z.string().min(1),
  languageId: z.string().min(1),
  version: z.number().int().default(1),
  text: z.string(),
});
export type LspTextDocumentDidOpenDto = z.infer<typeof LspTextDocumentDidOpenDtoSchema>;

export const LspTextDocumentDidChangeDtoSchema = z.object({
  workspaceId: z.string().min(1),
  path: z.string().min(1),
  version: z.number().int().default(1),
  content: z.string(),
});
export type LspTextDocumentDidChangeDto = z.infer<typeof LspTextDocumentDidChangeDtoSchema>;

export const LspTextDocumentDidSaveDtoSchema = z.object({
  workspaceId: z.string().min(1),
  path: z.string().min(1),
});
export type LspTextDocumentDidSaveDto = z.infer<typeof LspTextDocumentDidSaveDtoSchema>;

export const LspTextDocumentDidCloseDtoSchema = z.object({
  workspaceId: z.string().min(1),
  path: z.string().min(1),
});
export type LspTextDocumentDidCloseDto = z.infer<typeof LspTextDocumentDidCloseDtoSchema>;

// --- Completion ---

export const LspCompletionDtoSchema = z.object({
  workspaceId: z.string().min(1),
  path: z.string().min(1),
  position: LspPositionSchema,
  triggerCharacter: z.string().optional(),
});
export type LspCompletionDto = z.infer<typeof LspCompletionDtoSchema>;

export const LspCompletionItemSchema = z.object({
  label: z.string(),
  kind: z.number().int().default(1),
  detail: z.string().optional(),
  documentation: z.string().optional(),
  insertText: z.string().optional(),
  sortText: z.string().optional(),
  filterText: z.string().optional(),
});
export type LspCompletionItem = z.infer<typeof LspCompletionItemSchema>;

// --- Hover ---

export const LspHoverDtoSchema = z.object({
  workspaceId: z.string().min(1),
  path: z.string().min(1),
  position: LspPositionSchema,
});
export type LspHoverDto = z.infer<typeof LspHoverDtoSchema>;

export const LspHoverResultSchema = z.object({
  contents: z.array(z.string()),
  range: LspRangeSchema.optional(),
});
export type LspHoverResult = z.infer<typeof LspHoverResultSchema>;

// --- Definition & References ---

export const LspDefinitionDtoSchema = z.object({
  workspaceId: z.string().min(1),
  path: z.string().min(1),
  position: LspPositionSchema,
});
export type LspDefinitionDto = z.infer<typeof LspDefinitionDtoSchema>;

export const LspReferencesDtoSchema = z.object({
  workspaceId: z.string().min(1),
  path: z.string().min(1),
  position: LspPositionSchema,
  includeDeclaration: z.boolean().default(true),
});
export type LspReferencesDto = z.infer<typeof LspReferencesDtoSchema>;

// --- Rename ---

export const LspRenameDtoSchema = z.object({
  workspaceId: z.string().min(1),
  path: z.string().min(1),
  position: LspPositionSchema,
  newName: z.string().min(1),
});
export type LspRenameDto = z.infer<typeof LspRenameDtoSchema>;

export const LspTextEditSchema = z.object({
  range: LspRangeSchema,
  newText: z.string(),
});
export type LspTextEdit = z.infer<typeof LspTextEditSchema>;

export const LspWorkspaceEditSchema = z.object({
  changes: z.record(z.array(LspTextEditSchema)),
});
export type LspWorkspaceEdit = z.infer<typeof LspWorkspaceEditSchema>;

// --- Symbols ---

export const LspDocumentSymbolsDtoSchema = z.object({
  workspaceId: z.string().min(1),
  path: z.string().min(1),
});
export type LspDocumentSymbolsDto = z.infer<typeof LspDocumentSymbolsDtoSchema>;

export interface LspDocumentSymbol {
  name: string;
  detail?: string;
  kind: number;
  range: LspRange;
  selectionRange: LspRange;
  children?: LspDocumentSymbol[];
}

export const LspWorkspaceSymbolsDtoSchema = z.object({
  workspaceId: z.string().min(1),
  query: z.string(),
});
export type LspWorkspaceSymbolsDto = z.infer<typeof LspWorkspaceSymbolsDtoSchema>;

// --- Signature Help ---

export const LspSignatureHelpDtoSchema = z.object({
  workspaceId: z.string().min(1),
  path: z.string().min(1),
  position: LspPositionSchema,
});
export type LspSignatureHelpDto = z.infer<typeof LspSignatureHelpDtoSchema>;

export const LspSignatureHelpSchema = z.object({
  signatures: z.array(
    z.object({
      label: z.string(),
      documentation: z.string().optional(),
      parameters: z.array(
        z.object({
          label: z.string(),
          documentation: z.string().optional(),
        })
      ),
    })
  ),
  activeSignature: z.number().int().default(0),
  activeParameter: z.number().int().default(0),
});
export type LspSignatureHelp = z.infer<typeof LspSignatureHelpSchema>;

// --- Diagnostics ---

export const LspDiagnosticSeveritySchema = z.enum(["error", "warning", "info", "hint"]);
export type LspDiagnosticSeverity = z.infer<typeof LspDiagnosticSeveritySchema>;

export const LspDiagnosticSchema = z.object({
  path: z.string(),
  range: LspRangeSchema,
  severity: LspDiagnosticSeveritySchema,
  code: z.union([z.string(), z.number()]).optional(),
  message: z.string(),
  source: z.string().optional(),
});
export type LspDiagnostic = z.infer<typeof LspDiagnosticSchema>;

// --- Code Actions & Formatting ---

export const LspCodeActionDtoSchema = z.object({
  workspaceId: z.string().min(1),
  path: z.string().min(1),
  range: LspRangeSchema,
  context: z.object({
    diagnostics: z.array(LspDiagnosticSchema).default([]),
  }),
});
export type LspCodeActionDto = z.infer<typeof LspCodeActionDtoSchema>;

export const LspCodeActionSchema = z.object({
  title: z.string(),
  kind: z.string().optional(),
  edit: LspWorkspaceEditSchema.optional(),
  isPreferred: z.boolean().optional(),
});
export type LspCodeAction = z.infer<typeof LspCodeActionSchema>;

export const LspFormatDtoSchema = z.object({
  workspaceId: z.string().min(1),
  path: z.string().min(1),
  options: z
    .object({
      tabSize: z.number().int().default(2),
      insertSpaces: z.boolean().default(true),
    })
    .optional(),
});
export type LspFormatDto = z.infer<typeof LspFormatDtoSchema>;
