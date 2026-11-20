import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { DapManagerService } from "../src/services/debug/dap-manager.service.js";
import { DebugSessionStatus } from "@remote-ide/shared";

describe("Phase 8 — Debug Adapter Protocol (DAP) Manager", () => {
  let dap: DapManagerService;
  let tmpDir: string;
  let testScript: string;

  beforeEach(() => {
    dap = new DapManagerService();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "remoteide-dap-test-"));
    testScript = path.join(tmpDir, "debuggee.js");

    fs.writeFileSync(
      testScript,
      `const a = 10;
const b = 20;
function calculateSum(x, y) {
  const sum = x + y;
  return sum;
}
const result = calculateSum(a, b);
console.log("CALCULATION_RESULT:", result);
`
    );
  });

  afterEach(async () => {
    for (const session of dap.listSessions()) {
      await dap.stop(session.id);
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it("launches a real Node.js debug session with --inspect-brk and hits breakpoint", async () => {
    // Launch debug session stopped on entry
    const session = await dap.launch({
      workspaceId: "ws-dap",
      name: "Node Test Debug",
      type: "node",
      program: testScript,
      stopOnEntry: true,
    });

    expect(session.id).toBeDefined();
    expect(session.port).toBeGreaterThan(0);
    expect(session.status).toBe(DebugSessionStatus.PAUSED);

    // Set breakpoint on line 5 (inside calculateSum)
    const bps = await dap.setBreakpoints({
      workspaceId: "ws-dap",
      sessionId: session.id,
      path: testScript,
      breakpoints: [{ line: 5 }],
    });

    expect(bps.length).toBe(1);
    expect(bps[0]!.verified).toBe(true);

    // Continue execution to hit the breakpoint
    await dap.continue(session.id);

    // Wait for paused on breakpoint event
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        const current = dap.getSession(session.id);
        if (
          current.status === DebugSessionStatus.PAUSED &&
          current.stoppedDetails?.reason === "breakpoint"
        ) {
          clearInterval(check);
          resolve();
        }
      }, 50);

      setTimeout(() => {
        clearInterval(check);
        resolve();
      }, 4000);
    });

    const paused = dap.getSession(session.id);
    expect(paused.status).toBe(DebugSessionStatus.PAUSED);

    // Inspect call stack
    const stack = dap.getStackTrace(session.id);
    expect(stack.length).toBeGreaterThan(0);
    expect(stack[0]!.name).toContain("calculateSum");
    expect(stack[0]!.line).toBe(5);

    // Inspect scopes
    const scopes = dap.getScopes(session.id, 0);
    expect(scopes.length).toBeGreaterThan(0);
    const localScope = scopes.find((s) => s.name === "Local");
    expect(localScope).toBeDefined();

    // Inspect local variables
    const vars = await dap.getVariables(session.id, localScope!.variablesReference);
    expect(vars.length).toBeGreaterThan(0);
    const xVar = vars.find((v) => v.name === "x");
    const yVar = vars.find((v) => v.name === "y");
    expect(xVar?.value).toBe("10");
    expect(yVar?.value).toBe("20");

    // Evaluate expression in debug console / REPL context
    const evalResult = await dap.evaluate({
      workspaceId: "ws-dap",
      sessionId: session.id,
      expression: "x * y",
      frameId: 0,
    });
    expect(evalResult.result).toBe("200");

    // Step over
    await dap.stepOver(session.id);
    await new Promise((r) => setTimeout(r, 100));

    // Terminate session cleanly
    await dap.stop(session.id);
    const remaining = dap.listSessions("ws-dap");
    expect(remaining.length).toBe(0);
  });

  it("prevents duplicate launches of the same program in the same workspace", async () => {
    const s1 = await dap.launch({
      workspaceId: "ws-dap-dup",
      name: "Run 1",
      type: "node",
      program: testScript,
      stopOnEntry: true,
    });

    const s2 = await dap.launch({
      workspaceId: "ws-dap-dup",
      name: "Run 2",
      type: "node",
      program: testScript,
      stopOnEntry: true,
    });

    expect(s1.id).toBe(s2.id);
    await dap.stop(s1.id);
  });
});
