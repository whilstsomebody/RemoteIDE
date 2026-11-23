import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  TestSuite,
  TestCase,
  TestStatus,
  RunTestsDto,
  TestRunResult,
  TestFailure,
  TestLogEntry,
  CoverageSummary,
  generateId,
} from "@remote-ide/shared";

export class TestRunnerService {
  private lastRunResults = new Map<string, TestRunResult>(); // workspaceId -> TestRunResult

  public discoverTests(workspacePath: string): TestSuite[] {
    if (!fs.existsSync(workspacePath)) return [];

    const suites: TestSuite[] = [];

    const scanDirectory = (dir: string, depth = 0) => {
      if (depth > 6) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (
            entry.name.startsWith(".") ||
            entry.name === "node_modules" ||
            entry.name === "dist" ||
            entry.name === "build" ||
            entry.name === ".git"
          ) {
            continue;
          }

          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scanDirectory(fullPath, depth + 1);
          } else if (entry.isFile()) {
            const isTestFile =
              /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name) ||
              entry.name.startsWith("test_") ||
              entry.name.endsWith("_test.py");

            if (isTestFile) {
              const suite = this.parseTestFile(fullPath);
              if (suite) suites.push(suite);
            }
          }
        }
      } catch {
        // Ignore read errors
      }
    };

    scanDirectory(workspacePath);
    return suites;
  }

  private parseTestFile(filePath: string): TestSuite | null {
    try {
      const content = fs.readFileSync(filePath, "utf8");
      const suiteName = path.basename(filePath);
      const tests: TestCase[] = [];

      const lines = content.split("\n");
      // Match it("...", ...), it.skip("...", ...), test("...", ...), def test_...()
      const testRegex = /(?:it|test)(?:\.(?:only|skip))?\s*\(\s*["'`batch](.*?)["'`]/;
      const pyTestRegex = /def\s+(test_\w+)\s*\(/;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        const jsMatch = line.match(testRegex);
        if (jsMatch && jsMatch[1]) {
          const testName = jsMatch[1];
          tests.push({
            id: generateId("test"),
            name: testName,
            fullName: `${suiteName} > ${testName}`,
            filePath,
            line: i + 1,
            status: line.includes(".skip") ? TestStatus.SKIPPED : undefined,
          });
          continue;
        }

        const pyMatch = line.match(pyTestRegex);
        if (pyMatch && pyMatch[1]) {
          const testName = pyMatch[1];
          tests.push({
            id: generateId("test"),
            name: testName,
            fullName: `${suiteName} > ${testName}`,
            filePath,
            line: i + 1,
          });
        }
      }

      return {
        id: generateId("suite"),
        name: suiteName,
        filePath,
        tests,
      };
    } catch {
      return null;
    }
  }

  public async runTests(
    dto: RunTestsDto,
    workspacePath: string,
    onLog?: (log: TestLogEntry) => void
  ): Promise<TestRunResult> {
    const { workspaceId, scope, filePath, testName, failedOnly } = dto;
    const runId = generateId("trun");
    const startedAt = new Date().toISOString();
    const startTime = Date.now();

    const logs: TestLogEntry[] = [];

    const appendLog = (stream: "stdout" | "stderr", data: string) => {
      const entry: TestLogEntry = {
        stream,
        data,
        timestamp: new Date().toISOString(),
      };
      logs.push(entry);
      onLog?.(entry);
    };

    const command = "pnpm";
    let args: string[] = ["test"];

    if (failedOnly && this.lastRunResults.has(workspaceId)) {
      const prev = this.lastRunResults.get(workspaceId)!;
      if (prev.failures.length > 0) {
        // Target previous failure files
        const failureFiles = Array.from(new Set(prev.failures.map((f) => f.filePath)));
        if (failureFiles.length > 0) {
          args = ["vitest", "run", ...failureFiles];
        }
      }
    } else if (scope === "file" && filePath) {
      args = ["vitest", "run", filePath];
    } else if (scope === "single" && filePath && testName) {
      args = ["vitest", "run", filePath, "-t", testName];
    } else {
      args = ["vitest", "run"];
    }

    appendLog("stdout", `$ ${command} ${args.join(" ")}\n`);

    const result = await new Promise<TestRunResult>((resolve) => {
      const child = spawn(command, args, {
        cwd: workspacePath,
        env: {
          ...process.env,
          CI: "true",
          FORCE_COLOR: "0",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });

      let rawOutput = "";

      child.stdout.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        rawOutput += text;
        appendLog("stdout", text);
      });

      child.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        rawOutput += text;
        appendLog("stderr", text);
      });

      child.on("close", (exitCode) => {
        const durationMs = Date.now() - startTime;
        const parsed = this.parseVitestOutput(rawOutput, workspacePath);

        const runResult: TestRunResult = {
          id: runId,
          workspaceId,
          status: exitCode === 0 ? "completed" : "failed",
          scope,
          startedAt,
          completedAt: new Date().toISOString(),
          durationMs,
          total: parsed.total,
          passed: parsed.passed,
          failed: parsed.failed,
          skipped: parsed.skipped,
          failures: parsed.failures,
          logs,
          coverage: this.detectCoverage(workspacePath),
        };

        this.lastRunResults.set(workspaceId, runResult);
        resolve(runResult);
      });

      child.on("error", (err) => {
        appendLog("stderr", `Execution error: ${err.message}\n`);
        const durationMs = Date.now() - startTime;

        const runResult: TestRunResult = {
          id: runId,
          workspaceId,
          status: "failed",
          scope,
          startedAt,
          completedAt: new Date().toISOString(),
          durationMs,
          total: 0,
          passed: 0,
          failed: 1,
          skipped: 0,
          failures: [
            {
              testName: "Process Execution",
              filePath: filePath || "workspace",
              message: err.message,
            },
          ],
          logs,
        };

        this.lastRunResults.set(workspaceId, runResult);
        resolve(runResult);
      });
    });

    return result;
  }

  public getLastRun(workspaceId: string): TestRunResult | null {
    return this.lastRunResults.get(workspaceId) || null;
  }

  private parseVitestOutput(
    output: string,
    workspacePath: string
  ): {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    failures: TestFailure[];
  } {
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    const failures: TestFailure[] = [];

    // Match Vitest Summary line: "Tests 15 passed | 2 failed (17)"
    const summaryMatch = output.match(/Tests\s+(.*?)(?:\n|$)/);
    if (summaryMatch && summaryMatch[1]) {
      const summary = summaryMatch[1];
      const pMatch = summary.match(/(\d+)\s+passed/);
      const fMatch = summary.match(/(\d+)\s+failed/);
      const sMatch = summary.match(/(\d+)\s+skipped/);

      if (pMatch && pMatch[1]) passed = parseInt(pMatch[1], 10);
      if (fMatch && fMatch[1]) failed = parseInt(fMatch[1], 10);
      if (sMatch && sMatch[1]) skipped = parseInt(sMatch[1], 10);
    } else {
      // Fallback counting checkmarks vs crosses
      const passMatches = output.match(/✓\s+/g);
      const failMatches = output.match(/❯\s+|FAIL\s+|✕\s+/g);
      passed = passMatches ? passMatches.length : 0;
      failed = failMatches ? failMatches.length : 0;
    }

    const failureBlocks = output.split(/FAIL\s+|✕\s+|❯\s+/);
    for (let i = 1; i < failureBlocks.length; i++) {
      const block = failureBlocks[i]!;
      const lines = block.split("\n");
      const title = lines[0]?.trim() || "Test Failure";

      // Search for file path and line number: e.g. at ... (path/to/file.ts:24:5)
      const locMatch = block.match(
        /(?:at\s+.*?\s+\(?|\s+)([^\s()]+\.(?:ts|js|tsx|jsx)):(\d+):(\d+)\)?/
      );
      let targetFile = "";
      let targetLine = 1;

      if (locMatch && locMatch[1] && locMatch[2]) {
        targetFile = locMatch[1];
        targetLine = parseInt(locMatch[2], 10);
        if (!path.isAbsolute(targetFile)) {
          targetFile = path.resolve(workspacePath, targetFile);
        }
      }

      const errorMsgMatch = block.match(/AssertionError:?\s*(.*?)(?:\n|$)|Error:?\s*(.*?)(?:\n|$)/);
      const message = errorMsgMatch
        ? (errorMsgMatch[1] || errorMsgMatch[2] || title).trim()
        : title;

      if (failures.length < 50) {
        failures.push({
          testName: title,
          filePath: targetFile || path.join(workspacePath, "test"),
          line: targetLine,
          message,
          stack: block.slice(0, 500),
        });
      }
    }

    const total = passed + failed + skipped;
    return {
      total: total || (failed > 0 ? failed : passed),
      passed,
      failed,
      skipped,
      failures,
    };
  }

  private detectCoverage(workspacePath: string): CoverageSummary | undefined {
    const summaryFile = path.join(workspacePath, "coverage", "coverage-summary.json");
    if (!fs.existsSync(summaryFile)) return undefined;

    try {
      const data = JSON.parse(fs.readFileSync(summaryFile, "utf8"));
      if (data && data.total) {
        return {
          lines: data.total.lines || { total: 0, covered: 0, pct: 100 },
          statements: data.total.statements || { total: 0, covered: 0, pct: 100 },
          functions: data.total.functions || { total: 0, covered: 0, pct: 100 },
          branches: data.total.branches || { total: 0, covered: 0, pct: 100 },
        };
      }
    } catch {
      // Ignore parse error
    }
    return undefined;
  }
}

export const testRunnerService = new TestRunnerService();
