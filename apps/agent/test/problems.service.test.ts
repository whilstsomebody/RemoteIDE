import { describe, it, expect } from "vitest";
import { ProblemsService } from "../src/services/problems/problems.service.js";
import { LspManagerService } from "../src/services/lsp/lsp-manager.service.js";
import { TestRunnerService } from "../src/services/testing/test-runner.service.js";

describe("Phase 8 — Problems and Diagnostics Service", () => {
  it("aggregates LSP diagnostics, test failures, and build problems with filtering", () => {
    const lsp = new LspManagerService();
    const testRunner = new TestRunnerService();
    const service = new ProblemsService(lsp, testRunner);

    // Record manual build problem
    service.recordProblem({
      workspaceId: "ws-p",
      filePath: "src/main.ts",
      line: 12,
      col: 5,
      message: "Type 'string' is not assignable to type 'number'",
      severity: "error",
      source: "build",
      code: 2322,
    });

    service.recordProblem({
      workspaceId: "ws-p",
      filePath: "src/utils.ts",
      line: 45,
      col: 10,
      message: "Unused parameter 'options'",
      severity: "warning",
      source: "build",
      code: 6133,
    });

    const res = service.getProblems({
      workspaceId: "ws-p",
    });

    expect(res.items.length).toBe(2);
    expect(res.counts.total).toBe(2);
    expect(res.counts.errors).toBe(1);
    expect(res.counts.warnings).toBe(1);

    // Filter by severity
    const errorsOnly = service.getProblems({
      workspaceId: "ws-p",
      severity: "error",
    });
    expect(errorsOnly.items.length).toBe(1);
    expect(errorsOnly.items[0]!.filePath).toBe("src/main.ts");

    // Filter by query
    const queryRes = service.getProblems({
      workspaceId: "ws-p",
      query: "unused",
    });
    expect(queryRes.items.length).toBe(1);
    expect(queryRes.items[0]!.filePath).toBe("src/utils.ts");
  });
});
