import { execSync, ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import {
  LanguageServerStatus,
  LanguageServerMetadata,
  LspPosition,
  LspLocation,
  LspCompletionItem,
  LspHoverResult,
  LspTextEdit,
  LspWorkspaceEdit,
  LspDocumentSymbol,
  LspSignatureHelp,
  LspDiagnostic,
  LspCodeAction,
  LspTextDocumentDidOpenDto,
  LspTextDocumentDidChangeDto,
  LspTextDocumentDidSaveDto,
  LspTextDocumentDidCloseDto,
  LspCompletionDto,
  LspHoverDto,
  LspDefinitionDto,
  LspReferencesDto,
  LspRenameDto,
  LspSignatureHelpDto,
  LspCodeActionDto,
  LspFormatDto,
  logger,
} from "@remote-ide/shared";

interface DocumentSnapshot {
  version: number;
  content: string;
  languageId: string;
}

interface ExternalLspProcess {
  process: ChildProcess;
  serverId: string;
  workspaceId: string;
  pendingRequests: Map<
    number,
    {
      resolve: (data: unknown) => void;
      reject: (err: unknown) => void;
      method: string;
      timer: NodeJS.Timeout;
    }
  >;
  buffer: Buffer;
  nextRequestId: number;
}

export class LspManagerService {
  // In-memory document storage: workspaceId -> filePath -> DocumentSnapshot
  private documents = new Map<string, Map<string, DocumentSnapshot>>();

  // Active external LSP processes: `${workspaceId}:${serverId}` -> ExternalLspProcess
  private externalServers = new Map<string, ExternalLspProcess>();

  private diagnosticListeners = new Set<
    (workspaceId: string, path: string, diagnostics: LspDiagnostic[]) => void
  >();

  // Crash counters: serverId -> count
  private crashCounts = new Map<string, number>();

  // Server statuses: serverId -> LanguageServerStatus
  private serverStatuses = new Map<string, LanguageServerStatus>();

  // Last error per server: serverId -> string
  private serverErrors = new Map<string, string>();

  // TypeScript LanguageService caches per workspace: workspaceId -> ts.LanguageService
  private tsServices = new Map<
    string,
    { service: ts.LanguageService; host: ts.LanguageServiceHost }
  >();

  constructor() {
    this.serverStatuses.set("typescript", LanguageServerStatus.RUNNING);
  }

  public detectToolchain(): LanguageServerMetadata[] {
    const isCmdAvailable = (cmd: string): boolean => {
      try {
        execSync(`which ${cmd}`, { stdio: "ignore" });
        return true;
      } catch {
        return false;
      }
    };

    const nodeAvailable = isCmdAvailable("node");
    let nodeVersion = "Unknown";
    if (nodeAvailable) {
      try {
        nodeVersion = execSync("node -v", { encoding: "utf8" }).trim();
      } catch {
        nodeVersion = "Installed";
      }
    }
    const tsLspInstalled =
      isCmdAvailable("typescript-language-server") || isCmdAvailable("tsserver");

    const pythonAvailable = isCmdAvailable("python3") || isCmdAvailable("python");
    let pythonVersion = "Unavailable";
    if (pythonAvailable) {
      try {
        const cmd = isCmdAvailable("python3") ? "python3" : "python";
        pythonVersion = execSync(`${cmd} --version`, { encoding: "utf8" }).trim();
      } catch {
        pythonVersion = "Installed";
      }
    }
    const pyrightInstalled = isCmdAvailable("pyright") || isCmdAvailable("pylsp");

    const rustAvailable = isCmdAvailable("rustc");
    const rustAnalyzerInstalled = isCmdAvailable("rust-analyzer");

    const goAvailable = isCmdAvailable("go");
    const goplsInstalled = isCmdAvailable("gopls");

    const clangAvailable = isCmdAvailable("clang") || isCmdAvailable("gcc");
    const clangdInstalled = isCmdAvailable("clangd");

    const javaAvailable = isCmdAvailable("java");
    const jdtlsInstalled = isCmdAvailable("jdtls");

    const dotnetAvailable = isCmdAvailable("dotnet");
    const omnisharpInstalled = isCmdAvailable("omnisharp") || isCmdAvailable("csharp-ls");

    const servers: LanguageServerMetadata[] = [
      {
        id: "typescript",
        name: "TypeScript / JavaScript Language Server",
        languages: ["typescript", "javascript", "typescriptreact", "javascriptreact"],
        extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
        command: tsLspInstalled ? "typescript-language-server" : "built-in-ts-service",
        args: tsLspInstalled ? ["--stdio"] : [],
        isInstalled: true, // Built-in compiler service is always available
        runtimeAvailable: nodeAvailable,
        runtimeName: `Node.js (${nodeVersion}) + TS 5.x`,
        status: this.serverStatuses.get("typescript") || LanguageServerStatus.RUNNING,
        supportedFeatures: {
          completion: true,
          hover: true,
          definition: true,
          references: true,
          rename: true,
          documentSymbol: true,
          workspaceSymbol: true,
          signatureHelp: true,
          diagnostics: true,
          codeAction: true,
          formatting: true,
        },
        crashCount: this.crashCounts.get("typescript") || 0,
        lastError: this.serverErrors.get("typescript"),
      },
      {
        id: "python",
        name: "Python Language Server (Pyright / PyLSP)",
        languages: ["python"],
        extensions: [".py", ".pyi"],
        command: pyrightInstalled ? (isCmdAvailable("pyright") ? "pyright" : "pylsp") : "pyright",
        args: ["--stdio"],
        isInstalled: pyrightInstalled,
        runtimeAvailable: pythonAvailable,
        runtimeName: `Python (${pythonVersion})`,
        status: pyrightInstalled
          ? this.serverStatuses.get("python") || LanguageServerStatus.STOPPED
          : LanguageServerStatus.STOPPED,
        supportedFeatures: {
          completion: true,
          hover: true,
          definition: true,
          references: true,
          rename: true,
          documentSymbol: true,
          workspaceSymbol: true,
          signatureHelp: true,
          diagnostics: true,
          codeAction: false,
          formatting: true,
        },
        crashCount: this.crashCounts.get("python") || 0,
        lastError: this.serverErrors.get("python"),
      },
      {
        id: "rust",
        name: "Rust Analyzer",
        languages: ["rust"],
        extensions: [".rs"],
        command: "rust-analyzer",
        args: [],
        isInstalled: rustAnalyzerInstalled,
        runtimeAvailable: rustAvailable,
        runtimeName: "Rust Toolchain (rustc)",
        status: rustAnalyzerInstalled
          ? this.serverStatuses.get("rust") || LanguageServerStatus.STOPPED
          : LanguageServerStatus.STOPPED,
        supportedFeatures: {
          completion: true,
          hover: true,
          definition: true,
          references: true,
          rename: true,
          documentSymbol: true,
          workspaceSymbol: true,
          signatureHelp: true,
          diagnostics: true,
          codeAction: true,
          formatting: true,
        },
        crashCount: this.crashCounts.get("rust") || 0,
        lastError: this.serverErrors.get("rust"),
      },
      {
        id: "go",
        name: "Go Language Server (gopls)",
        languages: ["go"],
        extensions: [".go"],
        command: "gopls",
        args: [],
        isInstalled: goplsInstalled,
        runtimeAvailable: goAvailable,
        runtimeName: "Go Runtime (go)",
        status: goplsInstalled
          ? this.serverStatuses.get("go") || LanguageServerStatus.STOPPED
          : LanguageServerStatus.STOPPED,
        supportedFeatures: {
          completion: true,
          hover: true,
          definition: true,
          references: true,
          rename: true,
          documentSymbol: true,
          workspaceSymbol: true,
          signatureHelp: true,
          diagnostics: true,
          codeAction: true,
          formatting: true,
        },
        crashCount: this.crashCounts.get("go") || 0,
        lastError: this.serverErrors.get("go"),
      },
      {
        id: "cpp",
        name: "C/C++ Language Server (clangd)",
        languages: ["c", "cpp"],
        extensions: [".c", ".cpp", ".h", ".hpp", ".cc"],
        command: "clangd",
        args: ["--background-index"],
        isInstalled: clangdInstalled,
        runtimeAvailable: clangAvailable,
        runtimeName: "Clang / LLVM",
        status: clangdInstalled
          ? this.serverStatuses.get("cpp") || LanguageServerStatus.STOPPED
          : LanguageServerStatus.STOPPED,
        supportedFeatures: {
          completion: true,
          hover: true,
          definition: true,
          references: true,
          rename: true,
          documentSymbol: true,
          workspaceSymbol: true,
          signatureHelp: true,
          diagnostics: true,
          codeAction: true,
          formatting: true,
        },
        crashCount: this.crashCounts.get("cpp") || 0,
        lastError: this.serverErrors.get("cpp"),
      },
      {
        id: "java",
        name: "Java Language Server (JDTLS)",
        languages: ["java"],
        extensions: [".java"],
        command: "jdtls",
        args: [],
        isInstalled: jdtlsInstalled,
        runtimeAvailable: javaAvailable,
        runtimeName: "Java Virtual Machine (JVM)",
        status: jdtlsInstalled
          ? this.serverStatuses.get("java") || LanguageServerStatus.STOPPED
          : LanguageServerStatus.STOPPED,
        supportedFeatures: {
          completion: true,
          hover: true,
          definition: true,
          references: true,
          rename: true,
          documentSymbol: true,
          workspaceSymbol: true,
          signatureHelp: true,
          diagnostics: true,
          codeAction: true,
          formatting: true,
        },
        crashCount: this.crashCounts.get("java") || 0,
        lastError: this.serverErrors.get("java"),
      },
      {
        id: "csharp",
        name: "C# Language Server (OmniSharp)",
        languages: ["csharp"],
        extensions: [".cs"],
        command: "omnisharp",
        args: ["-lsp"],
        isInstalled: omnisharpInstalled,
        runtimeAvailable: dotnetAvailable,
        runtimeName: ".NET SDK",
        status: omnisharpInstalled
          ? this.serverStatuses.get("csharp") || LanguageServerStatus.STOPPED
          : LanguageServerStatus.STOPPED,
        supportedFeatures: {
          completion: true,
          hover: true,
          definition: true,
          references: true,
          rename: true,
          documentSymbol: true,
          workspaceSymbol: true,
          signatureHelp: true,
          diagnostics: true,
          codeAction: true,
          formatting: true,
        },
        crashCount: this.crashCounts.get("csharp") || 0,
        lastError: this.serverErrors.get("csharp"),
      },
    ];

    return servers;
  }

  public detectWorkspaceLanguage(workspacePath: string): {
    primaryLanguage: string;
    detectedLanguages: string[];
  } {
    if (!fs.existsSync(workspacePath)) {
      return { primaryLanguage: "typescript", detectedLanguages: ["typescript"] };
    }

    const counts: Record<string, number> = {
      typescript: 0,
      python: 0,
      rust: 0,
      go: 0,
      cpp: 0,
      java: 0,
      csharp: 0,
    };

    const scanDir = (dir: string, depth = 0) => {
      if (depth > 3) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (
            entry.name.startsWith(".") ||
            entry.name === "node_modules" ||
            entry.name === "dist"
          ) {
            continue;
          }
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scanDir(full, depth + 1);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (ext === ".ts" || ext === ".tsx" || ext === ".js" || ext === ".jsx")
              counts.typescript!++;
            else if (ext === ".py") counts.python!++;
            else if (ext === ".rs") counts.rust!++;
            else if (ext === ".go") counts.go!++;
            else if (ext === ".c" || ext === ".cpp" || ext === ".h") counts.cpp!++;
            else if (ext === ".java") counts.java!++;
            else if (ext === ".cs") counts.csharp!++;
          }
        }
      } catch {
        // Ignore read errors
      }
    };

    scanDir(workspacePath);

    let maxLang = "typescript";
    let maxCount = -1;
    const detected: string[] = [];

    for (const [lang, count] of Object.entries(counts)) {
      if (count > 0) detected.push(lang);
      if (count > maxCount) {
        maxCount = count;
        maxLang = lang;
      }
    }

    return {
      primaryLanguage: maxCount > 0 ? maxLang : "typescript",
      detectedLanguages: detected.length > 0 ? detected : ["typescript"],
    };
  }

  public async restartServer(serverId: string, workspaceId = "default"): Promise<void> {
    logger.info({ serverId, workspaceId }, "Restarting language server");

    const key = `${workspaceId}:${serverId}`;
    const external = this.externalServers.get(key);
    if (external) {
      try {
        external.process.kill("SIGTERM");
      } catch {
        // ignore kill error
      }
      this.externalServers.delete(key);
    }

    if (serverId === "typescript") {
      this.tsServices.delete(workspaceId);
    }

    this.serverStatuses.set(serverId, LanguageServerStatus.STARTING);
    this.serverErrors.delete(serverId);

    const prior = this.crashCounts.get(serverId) || 0;
    this.crashCounts.set(serverId, prior + 1);

    await new Promise((resolve) => setTimeout(resolve, 100));
    this.serverStatuses.set(serverId, LanguageServerStatus.RUNNING);
  }

  public shutdownWorkspace(workspaceId: string): void {
    for (const [key, ext] of this.externalServers.entries()) {
      if (key.startsWith(`${workspaceId}:`)) {
        try {
          ext.process.kill();
        } catch {
          // ignore
        }
        this.externalServers.delete(key);
      }
    }
    this.tsServices.delete(workspaceId);
    this.documents.delete(workspaceId);
  }

  public onDidOpen(dto: LspTextDocumentDidOpenDto): void {
    const { workspaceId, path: filePath, version, text, languageId } = dto;
    let wsDocs = this.documents.get(workspaceId);
    if (!wsDocs) {
      wsDocs = new Map();
      this.documents.set(workspaceId, wsDocs);
    }
    wsDocs.set(filePath, { version, content: text, languageId });

    this.broadcastDiagnostics(workspaceId, filePath);
  }

  public onDidChange(dto: LspTextDocumentDidChangeDto): void {
    const { workspaceId, path: filePath, version, content } = dto;
    let wsDocs = this.documents.get(workspaceId);
    if (!wsDocs) {
      wsDocs = new Map();
      this.documents.set(workspaceId, wsDocs);
    }
    const existing = wsDocs.get(filePath);
    wsDocs.set(filePath, {
      version,
      content,
      languageId: existing?.languageId || "typescript",
    });

    this.broadcastDiagnostics(workspaceId, filePath);
  }

  public onDidSave(dto: LspTextDocumentDidSaveDto): void {
    this.broadcastDiagnostics(dto.workspaceId, dto.path);
  }

  public onDidClose(dto: LspTextDocumentDidCloseDto): void {
    const wsDocs = this.documents.get(dto.workspaceId);
    if (wsDocs) {
      wsDocs.delete(dto.path);
    }
  }

  public onDiagnostic(
    listener: (workspaceId: string, path: string, diagnostics: LspDiagnostic[]) => void
  ): () => void {
    this.diagnosticListeners.add(listener);
    return () => this.diagnosticListeners.delete(listener);
  }

  private broadcastDiagnostics(workspaceId: string, filePath: string): void {
    const diagnostics = this.getDiagnostics(workspaceId, filePath);
    for (const listener of this.diagnosticListeners) {
      try {
        listener(workspaceId, filePath, diagnostics);
      } catch (err) {
        logger.error({ err }, "Error notifying diagnostic listener");
      }
    }
  }

  private getOrCreateTsService(workspaceId: string): ts.LanguageService {
    const cached = this.tsServices.get(workspaceId);
    if (cached) return cached.service;

    const compilerOptions: ts.CompilerOptions = {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
      allowJs: true,
      checkJs: true,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
      strict: false,
    };

    const host: ts.LanguageServiceHost = {
      getCompilationSettings: () => compilerOptions,
      getScriptFileNames: () => {
        const wsDocs = this.documents.get(workspaceId);
        if (!wsDocs) return [];
        return Array.from(wsDocs.keys());
      },
      getScriptVersion: (fileName: string) => {
        const wsDocs = this.documents.get(workspaceId);
        const doc = wsDocs?.get(fileName);
        return doc ? String(doc.version) : "0";
      },
      getScriptSnapshot: (fileName: string) => {
        const wsDocs = this.documents.get(workspaceId);
        const doc = wsDocs?.get(fileName);
        if (doc) {
          return ts.ScriptSnapshot.fromString(doc.content);
        }
        if (fs.existsSync(fileName)) {
          try {
            return ts.ScriptSnapshot.fromString(fs.readFileSync(fileName, "utf8"));
          } catch {
            return undefined;
          }
        }
        return undefined;
      },
      getCurrentDirectory: () => process.cwd(),
      getDefaultLibFileName: (opts) => ts.getDefaultLibFilePath(opts),
      fileExists: (fileName) => {
        const wsDocs = this.documents.get(workspaceId);
        return (wsDocs && wsDocs.has(fileName)) || fs.existsSync(fileName);
      },
      readFile: (fileName) => {
        const wsDocs = this.documents.get(workspaceId);
        const doc = wsDocs?.get(fileName);
        if (doc) return doc.content;
        try {
          return fs.readFileSync(fileName, "utf8");
        } catch {
          return undefined;
        }
      },
      readDirectory: ts.sys.readDirectory,
      directoryExists: ts.sys.directoryExists,
      getDirectories: ts.sys.getDirectories,
    };

    const service = ts.createLanguageService(host, ts.createDocumentRegistry());
    this.tsServices.set(workspaceId, { service, host });
    return service;
  }

  private getDocumentContent(workspaceId: string, filePath: string): string {
    const wsDocs = this.documents.get(workspaceId);
    const doc = wsDocs?.get(filePath);
    if (doc) return doc.content;
    if (fs.existsSync(filePath)) {
      try {
        return fs.readFileSync(filePath, "utf8");
      } catch {
        return "";
      }
    }
    return "";
  }

  private positionToOffset(content: string, pos: LspPosition): number {
    const lines = content.split("\n");
    let offset = 0;
    for (let i = 0; i < pos.line && i < lines.length; i++) {
      offset += lines[i]!.length + 1; // +1 for '\n'
    }
    return Math.min(offset + pos.character, content.length);
  }

  private offsetToPosition(content: string, offset: number): LspPosition {
    const clamped = Math.max(0, Math.min(offset, content.length));
    const prefix = content.slice(0, clamped);
    const lines = prefix.split("\n");
    const line = lines.length - 1;
    const character = lines[lines.length - 1]!.length;
    return { line, character };
  }

  public getCompletions(dto: LspCompletionDto): LspCompletionItem[] {
    const { workspaceId, path: filePath, position } = dto;
    const content = this.getDocumentContent(workspaceId, filePath);
    const offset = this.positionToOffset(content, position);

    const tsService = this.getOrCreateTsService(workspaceId);
    const info = tsService.getCompletionsAtPosition(filePath, offset, {
      includeInsertTextCompletions: true,
    } as any);

    if (!info || !info.entries) return [];

    return info.entries.slice(0, 100).map((entry) => {
      let kind = 1; // Text
      const k = String(entry.kind);
      if (k.includes("method") || k.includes("function")) kind = 2;
      else if (k.includes("constructor")) kind = 4;
      else if (k.includes("property") || k.includes("field") || k.includes("member")) kind = 5;
      else if (
        k.includes("variable") ||
        k.includes("var") ||
        k.includes("let") ||
        k.includes("const")
      )
        kind = 6;
      else if (k.includes("class")) kind = 7;
      else if (k.includes("interface")) kind = 8;
      else if (k.includes("module")) kind = 9;
      else if (k.includes("keyword")) kind = 14;

      return {
        label: entry.name,
        kind,
        sortText: entry.sortText,
        insertText: entry.insertText || entry.name,
        detail: entry.sourceDisplay ? ts.displayPartsToString(entry.sourceDisplay) : undefined,
      };
    });
  }

  public getHover(dto: LspHoverDto): LspHoverResult | null {
    const { workspaceId, path: filePath, position } = dto;
    const content = this.getDocumentContent(workspaceId, filePath);
    const offset = this.positionToOffset(content, position);

    const tsService = this.getOrCreateTsService(workspaceId);
    const quickInfo = tsService.getQuickInfoAtPosition(filePath, offset);

    if (!quickInfo) return null;

    const display = ts.displayPartsToString(quickInfo.displayParts || []);
    const docs = ts.displayPartsToString(quickInfo.documentation || []);
    const contents: string[] = [];

    if (display) {
      contents.push(`\`\`\`typescript\n${display}\n\`\`\``);
    }
    if (docs) {
      contents.push(docs);
    }

    const startPos = this.offsetToPosition(content, quickInfo.textSpan.start);
    const endPos = this.offsetToPosition(
      content,
      quickInfo.textSpan.start + quickInfo.textSpan.length
    );

    return {
      contents,
      range: { start: startPos, end: endPos },
    };
  }

  public getDefinition(dto: LspDefinitionDto): LspLocation[] {
    const { workspaceId, path: filePath, position } = dto;
    const content = this.getDocumentContent(workspaceId, filePath);
    const offset = this.positionToOffset(content, position);

    const tsService = this.getOrCreateTsService(workspaceId);
    const defs = tsService.getDefinitionAtPosition(filePath, offset);

    if (!defs || defs.length === 0) return [];

    return defs.map((d) => {
      const targetContent = this.getDocumentContent(workspaceId, d.fileName);
      const start = this.offsetToPosition(targetContent, d.textSpan.start);
      const end = this.offsetToPosition(targetContent, d.textSpan.start + d.textSpan.length);
      return {
        uri: `file://${d.fileName}`,
        path: d.fileName,
        range: { start, end },
      };
    });
  }

  public getReferences(dto: LspReferencesDto): LspLocation[] {
    const { workspaceId, path: filePath, position } = dto;
    const content = this.getDocumentContent(workspaceId, filePath);
    const offset = this.positionToOffset(content, position);

    const tsService = this.getOrCreateTsService(workspaceId);
    const refs = tsService.getReferencesAtPosition(filePath, offset);

    if (!refs || refs.length === 0) return [];

    return refs.map((r) => {
      const targetContent = this.getDocumentContent(workspaceId, r.fileName);
      const start = this.offsetToPosition(targetContent, r.textSpan.start);
      const end = this.offsetToPosition(targetContent, r.textSpan.start + r.textSpan.length);
      return {
        uri: `file://${r.fileName}`,
        path: r.fileName,
        range: { start, end },
      };
    });
  }

  public rename(dto: LspRenameDto): LspWorkspaceEdit {
    const { workspaceId, path: filePath, position, newName } = dto;
    const content = this.getDocumentContent(workspaceId, filePath);
    const offset = this.positionToOffset(content, position);

    const tsService = this.getOrCreateTsService(workspaceId);
    const renameLocations = tsService.findRenameLocations(filePath, offset, false, false);

    if (!renameLocations || renameLocations.length === 0) {
      return { changes: {} };
    }

    const changes: Record<string, LspTextEdit[]> = {};

    for (const loc of renameLocations) {
      const targetContent = this.getDocumentContent(workspaceId, loc.fileName);
      const start = this.offsetToPosition(targetContent, loc.textSpan.start);
      const end = this.offsetToPosition(targetContent, loc.textSpan.start + loc.textSpan.length);

      if (!changes[loc.fileName]) {
        changes[loc.fileName] = [];
      }
      changes[loc.fileName]!.push({
        range: { start, end },
        newText: newName,
      });
    }

    return { changes };
  }

  public getDocumentSymbols(workspaceId: string, filePath: string): LspDocumentSymbol[] {
    const content = this.getDocumentContent(workspaceId, filePath);
    const tsService = this.getOrCreateTsService(workspaceId);
    const nav = tsService.getNavigationTree(filePath);

    if (!nav) return [];

    const mapTree = (item: ts.NavigationTree): LspDocumentSymbol => {
      const start = this.offsetToPosition(content, item.spans[0]?.start || 0);
      const end = this.offsetToPosition(
        content,
        (item.spans[0]?.start || 0) + (item.spans[0]?.length || 0)
      );

      let kind = 1;
      const k = String(item.kind);
      if (k.includes("class")) kind = 5;
      else if (k.includes("interface")) kind = 11;
      else if (k.includes("method") || k.includes("function")) kind = 12;
      else if (k.includes("property") || k.includes("field")) kind = 7;
      else if (k.includes("variable") || k.includes("var")) kind = 13;

      return {
        name: item.text,
        kind,
        range: { start, end },
        selectionRange: { start, end },
        children: item.childItems?.map(mapTree),
      };
    };

    return nav.childItems ? nav.childItems.map(mapTree) : [mapTree(nav)];
  }

  public getSignatureHelp(dto: LspSignatureHelpDto): LspSignatureHelp | null {
    const { workspaceId, path: filePath, position } = dto;
    const content = this.getDocumentContent(workspaceId, filePath);
    const offset = this.positionToOffset(content, position);

    const tsService = this.getOrCreateTsService(workspaceId);
    const help = tsService.getSignatureHelpItems(filePath, offset, undefined);

    if (!help || !help.items || help.items.length === 0) return null;

    const signatures = help.items.map((item) => {
      const prefix = ts.displayPartsToString(item.prefixDisplayParts);
      const suffix = ts.displayPartsToString(item.suffixDisplayParts);
      const params = item.parameters.map((p) => ({
        label: ts.displayPartsToString(p.displayParts),
        documentation: ts.displayPartsToString(p.documentation),
      }));
      const paramStr = params.map((p) => p.label).join(", ");
      return {
        label: `${prefix}${paramStr}${suffix}`,
        documentation: ts.displayPartsToString(item.documentation),
        parameters: params,
      };
    });

    return {
      signatures,
      activeSignature: help.selectedItemIndex,
      activeParameter: help.argumentIndex,
    };
  }

  public getDiagnostics(workspaceId: string, filePath: string): LspDiagnostic[] {
    const content = this.getDocumentContent(workspaceId, filePath);
    if (!content) return [];

    const tsService = this.getOrCreateTsService(workspaceId);
    const syntactic = tsService.getSyntacticDiagnostics(filePath);
    const semantic = tsService.getSemanticDiagnostics(filePath);
    const all = [...syntactic, ...semantic];

    return all.map((d) => {
      const start = this.offsetToPosition(content, d.start || 0);
      const end = this.offsetToPosition(content, (d.start || 0) + (d.length || 0));
      const message = ts.flattenDiagnosticMessageText(d.messageText, "\n");

      let severity: "error" | "warning" | "info" | "hint" = "error";
      if (d.category === ts.DiagnosticCategory.Warning) severity = "warning";
      else if (d.category === ts.DiagnosticCategory.Message) severity = "info";
      else if (d.category === ts.DiagnosticCategory.Suggestion) severity = "hint";

      return {
        path: filePath,
        range: { start, end },
        severity,
        code: d.code,
        message,
        source: "typescript",
      };
    });
  }

  public getCodeActions(dto: LspCodeActionDto): LspCodeAction[] {
    const { workspaceId, path: filePath, range } = dto;
    const content = this.getDocumentContent(workspaceId, filePath);
    const startOffset = this.positionToOffset(content, range.start);
    const endOffset = this.positionToOffset(content, range.end);

    const tsService = this.getOrCreateTsService(workspaceId);
    const fixes = tsService.getCodeFixesAtPosition(
      filePath,
      startOffset,
      endOffset,
      [2304, 2552, 6133], // Common fixable error codes
      {},
      {}
    );

    if (!fixes || fixes.length === 0) return [];

    return fixes.map((fix) => {
      const changes: Record<string, LspTextEdit[]> = {};
      for (const change of fix.changes) {
        changes[change.fileName] = change.textChanges.map((tc) => {
          const targetContent = this.getDocumentContent(workspaceId, change.fileName);
          const start = this.offsetToPosition(targetContent, tc.span.start);
          const end = this.offsetToPosition(targetContent, tc.span.start + tc.span.length);
          return {
            range: { start, end },
            newText: tc.newText,
          };
        });
      }
      return {
        title: fix.description,
        kind: "quickfix",
        edit: { changes },
      };
    });
  }

  public formatDocument(dto: LspFormatDto): LspTextEdit[] {
    const { workspaceId, path: filePath, options } = dto;
    const content = this.getDocumentContent(workspaceId, filePath);
    const tsService = this.getOrCreateTsService(workspaceId);

    const formatOpts: ts.FormatCodeSettings = {
      tabSize: options?.tabSize || 2,
      indentSize: options?.tabSize || 2,
      convertTabsToSpaces: options?.insertSpaces ?? true,
      insertSpaceAfterCommaDelimiter: true,
      insertSpaceAfterSemicolonInForStatements: true,
      insertSpaceBeforeAndAfterBinaryOperators: true,
      insertSpaceAfterKeywordsInControlFlowStatements: true,
      insertSpaceAfterFunctionKeywordForAnonymousFunctions: true,
    };

    const edits = tsService.getFormattingEditsForDocument(filePath, formatOpts);
    if (!edits || edits.length === 0) return [];

    return edits.map((e) => {
      const start = this.offsetToPosition(content, e.span.start);
      const end = this.offsetToPosition(content, e.span.start + e.span.length);
      return {
        range: { start, end },
        newText: e.newText,
      };
    });
  }
}

export const lspManagerService = new LspManagerService();
