import { ProblemItem, ProblemFilterDto, generateId } from "@remote-ide/shared";
import { lspManagerService, LspManagerService } from "../lsp/lsp-manager.service.js";
import { testRunnerService, TestRunnerService } from "../testing/test-runner.service.js";

export class ProblemsService {
  private manualProblems: ProblemItem[] = [];

  constructor(
    private lsp: LspManagerService = lspManagerService,
    private testRunner: TestRunnerService = testRunnerService
  ) {}

  public recordProblem(problem: Omit<ProblemItem, "id">): ProblemItem {
    const item: ProblemItem = {
      ...problem,
      id: generateId("prob"),
    };
    this.manualProblems.push(item);
    return item;
  }

  public clearBuildProblems(workspaceId: string): void {
    this.manualProblems = this.manualProblems.filter(
      (p) => !(p.workspaceId === workspaceId && p.source === "build")
    );
  }

  public getProblems(filter: ProblemFilterDto): {
    items: ProblemItem[];
    counts: { total: number; errors: number; warnings: number; info: number; hints: number };
  } {
    const { workspaceId, filePath, severity, source, query } = filter;
    const allProblems: ProblemItem[] = [];

    // 1. Gather LSP diagnostics for specified workspace/file
    if (filePath) {
      const lspDiags = this.lsp.getDiagnostics(workspaceId, filePath);
      for (const d of lspDiags) {
        allProblems.push({
          id: `lsp_${filePath}_${d.range.start.line}_${d.range.start.character}`,
          workspaceId,
          filePath,
          line: d.range.start.line + 1,
          col: d.range.start.character + 1,
          message: d.message,
          severity: d.severity,
          source: "lsp",
          code: d.code,
        });
      }
    }

    // 2. Gather Test failures from last test run
    const lastRun = this.testRunner.getLastRun(workspaceId);
    if (lastRun && lastRun.failures) {
      for (let i = 0; i < lastRun.failures.length; i++) {
        const fail = lastRun.failures[i]!;
        if (!filePath || fail.filePath === filePath) {
          allProblems.push({
            id: `test_fail_${i}`,
            workspaceId,
            filePath: fail.filePath,
            line: fail.line || 1,
            col: 1,
            message: `[Test Failed] ${fail.testName}: ${fail.message}`,
            severity: "error",
            source: "test",
            relatedInformation: fail.stack,
          });
        }
      }
    }

    // 3. Gather Manual/Build problems
    for (const p of this.manualProblems) {
      if (p.workspaceId === workspaceId) {
        if (!filePath || p.filePath === filePath) {
          allProblems.push(p);
        }
      }
    }

    // 4. Apply filters
    let filtered = allProblems;
    if (severity) {
      filtered = filtered.filter((p) => p.severity === severity);
    }
    if (source) {
      filtered = filtered.filter((p) => p.source === source);
    }
    if (query) {
      const q = query.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.message.toLowerCase().includes(q) ||
          p.filePath.toLowerCase().includes(q) ||
          (p.code && String(p.code).toLowerCase().includes(q))
      );
    }

    // 5. Calculate severity counts
    const counts = {
      total: filtered.length,
      errors: filtered.filter((p) => p.severity === "error").length,
      warnings: filtered.filter((p) => p.severity === "warning").length,
      info: filtered.filter((p) => p.severity === "info").length,
      hints: filtered.filter((p) => p.severity === "hint").length,
    };

    return { items: filtered, counts };
  }
}

export const problemsService = new ProblemsService();
