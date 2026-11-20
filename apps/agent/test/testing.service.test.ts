import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { TestRunnerService } from "../src/services/testing/test-runner.service.js";

describe("Phase 8 — Test Explorer and Execution Service", () => {
  let runner: TestRunnerService;
  let tmpDir: string;
  let testFile: string;

  beforeEach(() => {
    runner = new TestRunnerService();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "remoteide-test-runner-"));
    testFile = path.join(tmpDir, "math.test.ts");

    fs.writeFileSync(
      testFile,
      `import { describe, it, expect } from "vitest";

describe("Math operations", () => {
  it("adds numbers correctly", () => {
    expect(1 + 2).toBe(3);
  });

  it("multiplies numbers correctly", () => {
    expect(2 * 3).toBe(6);
  });
});
`
    );
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it("discovers test suites and individual test cases by scanning workspace files", () => {
    const suites = runner.discoverTests(tmpDir);
    expect(suites.length).toBe(1);
    expect(suites[0]!.name).toBe("math.test.ts");
    expect(suites[0]!.tests.length).toBe(2);
    expect(suites[0]!.tests[0]!.name).toBe("adds numbers correctly");
    expect(suites[0]!.tests[1]!.name).toBe("multiplies numbers correctly");
  });

  it("handles test execution failure and captures stack trace with location", async () => {
    const failingFile = path.join(tmpDir, "fail.test.ts");
    fs.writeFileSync(
      failingFile,
      `import { it, expect } from "vitest";
it("deliberate failure test", () => {
  expect(10).toBe(20);
});
`
    );

    const suites = runner.discoverTests(tmpDir);
    expect(suites.length).toBe(2);

    const result = await runner.runTests(
      {
        workspaceId: "ws-test",
        scope: "file",
        filePath: failingFile,
      },
      tmpDir
    );

    expect(result.id).toBeDefined();
    expect(result.workspaceId).toBe("ws-test");
    expect(result.status).toBeDefined();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.logs)).toBe(true);

    const last = runner.getLastRun("ws-test");
    expect(last).toBeDefined();
    expect(last?.id).toBe(result.id);
  });
});

