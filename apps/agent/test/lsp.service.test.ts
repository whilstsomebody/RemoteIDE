import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { LspManagerService } from "../src/services/lsp/lsp-manager.service.js";
import { LanguageServerStatus } from "@remote-ide/shared";

describe("Phase 8 — Language Server Protocol (LSP) Manager", () => {
  let lsp: LspManagerService;
  let tmpDir: string;
  let sampleTsFile: string;

  beforeEach(() => {
    lsp = new LspManagerService();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "remoteide-lsp-test-"));
    sampleTsFile = path.join(tmpDir, "calculator.ts");

    fs.writeFileSync(
      sampleTsFile,
      `export class Calculator {
  public add(a: number, b: number): number {
    return a + b;
  }
}

const calc = new Calculator();
const result = calc.add(10, 20);
`
    );
  });

  afterEach(() => {
    lsp.shutdownWorkspace("test-ws");
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it("detects toolchains on host and clearly distinguishes installed vs missing tooling", () => {
    const servers = lsp.detectToolchain();
    expect(servers.length).toBeGreaterThanOrEqual(4);

    const tsServer = servers.find((s) => s.id === "typescript");
    expect(tsServer).toBeDefined();
    expect(tsServer!.isInstalled).toBe(true);
    expect(tsServer!.runtimeAvailable).toBe(true);
    expect(tsServer!.supportedFeatures.completion).toBe(true);
    expect(tsServer!.supportedFeatures.definition).toBe(true);
    expect(tsServer!.supportedFeatures.diagnostics).toBe(true);

    const rustServer = servers.find((s) => s.id === "rust");
    expect(rustServer).toBeDefined();
    expect(typeof rustServer!.isInstalled).toBe("boolean");
  });

  it("detects primary workspace language and file extensions", () => {
    const detected = lsp.detectWorkspaceLanguage(tmpDir);
    expect(detected.primaryLanguage).toBe("typescript");
    expect(detected.detectedLanguages).toContain("typescript");
  });

  it("synchronizes documents through didOpen, didChange, and didClose lifecycle", () => {
    lsp.onDidOpen({
      workspaceId: "test-ws",
      path: sampleTsFile,
      languageId: "typescript",
      version: 1,
      text: "export const answer: number = 42;",
    });

    // Request autocompletion on open document
    const completions = lsp.getCompletions({
      workspaceId: "test-ws",
      path: sampleTsFile,
      position: { line: 0, character: 13 },
    });
    expect(Array.isArray(completions)).toBe(true);

    // Modify document
    lsp.onDidChange({
      workspaceId: "test-ws",
      path: sampleTsFile,
      version: 2,
      content: "export const answer: number = 'invalid';", // Type mismatch error
    });

    const diags = lsp.getDiagnostics("test-ws", sampleTsFile);
    expect(diags.length).toBeGreaterThan(0);
    expect(diags[0]!.severity).toBe("error");
    expect(diags[0]!.message).toContain("not assignable to type 'number'");

    lsp.onDidClose({
      workspaceId: "test-ws",
      path: sampleTsFile,
    });
  });

  it("provides intelligent autocompletion for TypeScript symbols", () => {
    lsp.onDidOpen({
      workspaceId: "test-ws",
      path: sampleTsFile,
      languageId: "typescript",
      version: 1,
      text: `const greeting: string = "hello";
greeting.toU
`,
    });

    const items = lsp.getCompletions({
      workspaceId: "test-ws",
      path: sampleTsFile,
      position: { line: 1, character: 12 },
    });

    expect(items.length).toBeGreaterThan(0);
    expect(items.some((i) => i.label === "toUpperCase")).toBe(true);
  });

  it("provides hover information with formatted type signatures and docs", () => {
    lsp.onDidOpen({
      workspaceId: "test-ws",
      path: sampleTsFile,
      languageId: "typescript",
      version: 1,
      text: `/**
 * Adds two integers together.
 */
function add(x: number, y: number): number {
  return x + y;
}
add(1, 2);
`,
    });

    // Hover over 'add' invocation on line 6
    const hover = lsp.getHover({
      workspaceId: "test-ws",
      path: sampleTsFile,
      position: { line: 6, character: 1 },
    });

    expect(hover).not.toBeNull();
    expect(hover!.contents.length).toBeGreaterThan(0);
    expect(hover!.contents[0]).toContain("function add(x: number, y: number): number");
  });

  it("navigates to symbol definition and finds references across files", () => {
    lsp.onDidOpen({
      workspaceId: "test-ws",
      path: sampleTsFile,
      languageId: "typescript",
      version: 1,
      text: `export function helperFunction(): string {
  return "ok";
}

const v = helperFunction();
`,
    });

    // Go to definition of 'helperFunction' invocation on line 4
    const defs = lsp.getDefinition({
      workspaceId: "test-ws",
      path: sampleTsFile,
      position: { line: 4, character: 12 },
    });

    expect(defs.length).toBeGreaterThan(0);
    expect(defs[0]!.range.start.line).toBe(0);

    // Find references of 'helperFunction'
    const refs = lsp.getReferences({
      workspaceId: "test-ws",
      path: sampleTsFile,
      position: { line: 0, character: 18 },
      includeDeclaration: true,
    });

    expect(refs.length).toBeGreaterThanOrEqual(2);
  });

  it("renames symbols across workspace documents", () => {
    lsp.onDidOpen({
      workspaceId: "test-ws",
      path: sampleTsFile,
      languageId: "typescript",
      version: 1,
      text: `const originalSymbol = 100;
const secondRef = originalSymbol + 50;
`,
    });

    const edit = lsp.rename({
      workspaceId: "test-ws",
      path: sampleTsFile,
      position: { line: 0, character: 8 },
      newName: "renamedSymbol",
    });

    expect(edit.changes[sampleTsFile]).toBeDefined();
    expect(edit.changes[sampleTsFile]!.length).toBe(2);
    expect(edit.changes[sampleTsFile]![0]!.newText).toBe("renamedSymbol");
  });

  it("returns document symbols and hierarchy", () => {
    lsp.onDidOpen({
      workspaceId: "test-ws",
      path: sampleTsFile,
      languageId: "typescript",
      version: 1,
      text: `export class UserService {
  public getUser(): string {
    return "User";
  }
}
`,
    });

    const symbols = lsp.getDocumentSymbols("test-ws", sampleTsFile);
    expect(symbols.length).toBeGreaterThan(0);
    const userClass = symbols.find((s) => s.name === "UserService");
    expect(userClass).toBeDefined();
    expect(userClass!.children?.some((c) => c.name === "getUser")).toBe(true);
  });

  it("formats unformatted TypeScript documents", () => {
    lsp.onDidOpen({
      workspaceId: "test-ws",
      path: sampleTsFile,
      languageId: "typescript",
      version: 1,
      text: "const    x:number=1+2 ;",
    });

    const edits = lsp.formatDocument({
      workspaceId: "test-ws",
      path: sampleTsFile,
    });

    expect(edits.length).toBeGreaterThan(0);
  });

  it("restarts language servers and increments crash recovery counts", async () => {
    await lsp.restartServer("typescript", "test-ws");
    const servers = lsp.detectToolchain();
    const tsServer = servers.find((s) => s.id === "typescript")!;
    expect(tsServer.status).toBe(LanguageServerStatus.RUNNING);
    expect(tsServer.crashCount).toBe(1);
  });
});
