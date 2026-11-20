import { spawn, ChildProcess } from "node:child_process";
import http from "node:http";
import path from "node:path";
import WebSocket from "ws";
import {
  DebugSession,
  DebugSessionStatus,
  LaunchDebugDto,
  AttachDebugDto,
  SetBreakpointsDto,
  Breakpoint,
  StackFrame,
  Scope,
  Variable,
  EvaluateDto,
  EvaluateResult,
  AppError,
  ErrorCode,
  generateId,
  logger,
} from "@remote-ide/shared";

interface V8CallFrame {
  callFrameId: string;
  functionName: string;
  location: { scriptId: string; lineNumber: number; columnNumber: number };
  url: string;
  scopeChain: Array<{
    type: "local" | "closure" | "catch" | "block" | "script" | "with" | "global" | "module";
    object: { type: string; objectId?: string; className?: string; description?: string };
    name?: string;
  }>;
  this: { type: string; objectId?: string; className?: string; value?: unknown };
}

interface ActiveSessionRecord {
  session: DebugSession;
  process?: ChildProcess;
  ws?: WebSocket;
  wsUrl?: string;
  port: number;
  isAttached: boolean;
  launchConfig?: LaunchDebugDto;
  stopOnEntry?: boolean;
  hasResumedEntry?: boolean;
  nextV8Id: number;
  v8Pending: Map<number, { resolve: (val: any) => void; reject: (err: any) => void }>;
  currentCallFrames: V8CallFrame[];
  variableReferences: Map<number, string>; // refId -> objectId
  nextVarRef: number;
  breakpoints: Map<string, Breakpoint[]>; // filePath -> Breakpoints
  listeners: Set<(event: { type: string; body: unknown }) => void>;
}

export class DapManagerService {
  private sessions = new Map<string, ActiveSessionRecord>();

  public listSessions(workspaceId?: string): DebugSession[] {
    const list = Array.from(this.sessions.values()).map((r) => r.session);
    if (workspaceId) {
      return list.filter((s) => s.workspaceId === workspaceId);
    }
    return list;
  }

  public getSession(sessionId: string): DebugSession {
    const rec = this.sessions.get(sessionId);
    if (!rec) {
      throw new AppError(ErrorCode.NOT_FOUND, `Debug session ${sessionId} not found`);
    }
    return rec.session;
  }

  // --- 1. Launch & Attach ---

  public async launch(dto: LaunchDebugDto): Promise<DebugSession> {
    const { workspaceId, name, type, program, args = [], cwd, env = {}, stopOnEntry } = dto;

    // Prevent duplicate launch of the same target program in workspace
    for (const rec of this.sessions.values()) {
      if (
        rec.session.workspaceId === workspaceId &&
        rec.session.program === program &&
        (rec.session.status === DebugSessionStatus.RUNNING ||
          rec.session.status === DebugSessionStatus.PAUSED)
      ) {
        logger.info({ program, sessionId: rec.session.id }, "Reusing active debug session");
        return rec.session;
      }
    }

    if (type !== "node") {
      throw new AppError(ErrorCode.VALIDATION_ERROR, `Debugging for ${type} is not yet supported`);
    }

    const sessionId = generateId("dbg");
    const port = 9300 + Math.floor(Math.random() * 5000);
    const resolvedProgram = path.isAbsolute(program)
      ? program
      : path.resolve(cwd || process.cwd(), program);

    const session: DebugSession = {
      id: sessionId,
      workspaceId,
      name,
      type,
      status: DebugSessionStatus.LAUNCHING,
      startedAt: new Date().toISOString(),
      port,
      program: resolvedProgram,
      args,
    };

    const record: ActiveSessionRecord = {
      session,
      port,
      isAttached: false,
      launchConfig: dto,
      stopOnEntry,
      hasResumedEntry: false,
      nextV8Id: 1,
      v8Pending: new Map(),
      currentCallFrames: [],
      variableReferences: new Map(),
      nextVarRef: 1000,
      breakpoints: new Map(),
      listeners: new Set(),
    };

    this.sessions.set(sessionId, record);

    // Spawn node with inspector break
    const child = spawn(process.execPath, [`--inspect-brk=${port}`, resolvedProgram, ...args], {
      cwd: cwd || path.dirname(resolvedProgram),
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    record.process = child;
    session.pid = child.pid;

    // Capture stdout/stderr for debug console
    child.stdout?.on("data", (chunk: Buffer) => {
      this.emitEvent(record, "output", {
        category: "stdout",
        output: chunk.toString(),
      });
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      this.emitEvent(record, "output", {
        category: "stderr",
        output: chunk.toString(),
      });
    });

    child.on("exit", (code, signal) => {
      logger.info({ sessionId, code, signal }, "Debuggee process exited");
      session.status = DebugSessionStatus.TERMINATED;
      this.emitEvent(record, "terminated", { exitCode: code });
    });

    child.on("error", (err) => {
      logger.error({ sessionId, err }, "Debuggee process error");
      session.status = DebugSessionStatus.FAILED;
      session.error = err.message;
      this.emitEvent(record, "terminated", { error: err.message });
    });

    // Connect to V8 inspector
    await this.connectToInspector(record, port, stopOnEntry);

    return session;
  }

  public async attach(dto: AttachDebugDto): Promise<DebugSession> {
    const { workspaceId, name, type, port } = dto;
    const sessionId = generateId("dbg");

    const session: DebugSession = {
      id: sessionId,
      workspaceId,
      name,
      type,
      status: DebugSessionStatus.LAUNCHING,
      startedAt: new Date().toISOString(),
      port,
    };

    const record: ActiveSessionRecord = {
      session,
      port,
      isAttached: true,
      nextV8Id: 1,
      v8Pending: new Map(),
      currentCallFrames: [],
      variableReferences: new Map(),
      nextVarRef: 1000,
      breakpoints: new Map(),
      listeners: new Set(),
    };

    this.sessions.set(sessionId, record);
    await this.connectToInspector(record, port, false);
    return session;
  }

  private async connectToInspector(
    record: ActiveSessionRecord,
    port: number,
    stopOnEntry = false
  ): Promise<void> {
    // Wait for inspector endpoint to become available
    let wsUrl: string | null = null;
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        wsUrl = await this.queryInspectorWsUrl(port);
        if (wsUrl) break;
      } catch {
        // Retry
      }
      await new Promise((r) => setTimeout(r, 100));
    }

    if (!wsUrl) {
      record.session.status = DebugSessionStatus.FAILED;
      record.session.error = `Failed to connect to Node inspector on port ${port}`;
      throw new AppError(ErrorCode.INTERNAL_SERVER_ERROR, record.session.error);
    }

    record.wsUrl = wsUrl;
    const ws = new WebSocket(wsUrl);
    record.ws = ws;

    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", (err) => reject(err));
      setTimeout(() => reject(new Error("Inspector WebSocket connection timeout")), 5000);
    });

    ws.on("message", (raw: WebSocket.Data) => {
      try {
        const msg = JSON.parse(raw.toString());
        this.handleV8Message(record, msg);
      } catch (err) {
        logger.error({ err }, "Error parsing V8 inspector message");
      }
    });

    ws.on("close", () => {
      record.session.status = DebugSessionStatus.TERMINATED;
      this.emitEvent(record, "terminated", {});
    });

    // Initialize V8 domains
    await this.sendV8(record, "Runtime.enable");
    await this.sendV8(record, "Debugger.enable");
    await this.sendV8(record, "Debugger.setPauseOnExceptions", { state: "none" });

    // Node with --inspect-brk pauses at the entrypoint once runIfWaitingForDebugger is sent.
    await this.sendV8(record, "Runtime.runIfWaitingForDebugger");

    if (stopOnEntry) {
      // Wait briefly for the entry pause event so currentCallFrames are populated
      const deadline = Date.now() + 1500;
      while (record.session.status !== DebugSessionStatus.PAUSED && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 20));
      }
      if (record.session.status !== DebugSessionStatus.PAUSED) {
        record.session.status = DebugSessionStatus.PAUSED;
        record.session.stoppedDetails = {
          reason: "entry",
          description: "Paused on entry",
          threadId: 1,
        };
      }
    } else {
      record.session.status = DebugSessionStatus.RUNNING;
    }
  }

  private queryInspectorWsUrl(port: number): Promise<string | null> {
    return new Promise((resolve) => {
      const req = http.get(`http://127.0.0.1:${port}/json/list`, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            const list = JSON.parse(body);
            if (Array.isArray(list) && list[0]?.webSocketDebuggerUrl) {
              resolve(list[0].webSocketDebuggerUrl);
            } else {
              resolve(null);
            }
          } catch {
            resolve(null);
          }
        });
      });
      req.on("error", () => resolve(null));
      req.setTimeout(500, () => {
        req.destroy();
        resolve(null);
      });
    });
  }

  private sendV8(record: ActiveSessionRecord, method: string, params?: unknown): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!record.ws || record.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error("Inspector WebSocket is not connected"));
      }

      const id = record.nextV8Id++;
      record.v8Pending.set(id, { resolve, reject });

      record.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  private handleV8Message(record: ActiveSessionRecord, msg: any): void {
    if (msg.id && record.v8Pending.has(msg.id)) {
      const pending = record.v8Pending.get(msg.id)!;
      record.v8Pending.delete(msg.id);
      if (msg.error) {
        pending.reject(new Error(msg.error.message || "V8 inspector error"));
      } else {
        pending.resolve(msg.result);
      }
      return;
    }

    if (msg.method === "Debugger.paused") {
      if (!record.stopOnEntry && !record.hasResumedEntry) {
        record.hasResumedEntry = true;
        this.sendV8(record, "Debugger.resume").catch(() => {});
        return;
      }

      record.session.status = DebugSessionStatus.PAUSED;
      record.currentCallFrames = msg.params.callFrames || [];
      const reason = msg.params.reason === "other" ? "breakpoint" : (msg.params.reason as any);

      record.session.stoppedDetails = {
        reason,
        description: `Paused (${reason})`,
        threadId: 1,
      };

      this.emitEvent(record, "stopped", {
        reason,
        threadId: 1,
        allThreadsStopped: true,
      });
    } else if (msg.method === "Debugger.resumed") {
      record.session.status = DebugSessionStatus.RUNNING;
      record.session.stoppedDetails = undefined;
      record.currentCallFrames = [];
      this.emitEvent(record, "continued", {
        threadId: 1,
        allThreadsContinued: true,
      });
    } else if (msg.method === "Runtime.consoleAPICalled") {
      const text = (msg.params.args || [])
        .map((a: any) => a.value ?? a.description ?? "")
        .join(" ");
      this.emitEvent(record, "output", {
        category: "console",
        output: `${text}\n`,
      });
    }
  }

  // --- 2. Breakpoints ---

  public async setBreakpoints(dto: SetBreakpointsDto): Promise<Breakpoint[]> {
    const { sessionId, path: filePath, breakpoints } = dto;
    const record = this.sessions.get(sessionId);
    if (!record) {
      throw new AppError(ErrorCode.NOT_FOUND, `Debug session ${sessionId} not found`);
    }

    const results: Breakpoint[] = [];
    let idCounter = 1;

    for (const bp of breakpoints) {
      try {
        const res = await this.sendV8(record, "Debugger.setBreakpointByUrl", {
          lineNumber: bp.line - 1, // V8 line numbers are 0-based
          urlRegex: path.basename(filePath).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          condition: bp.condition,
        });

        results.push({
          id: idCounter++,
          verified: Boolean(res.breakpointId),
          line: bp.line,
          column: bp.column,
          source: { path: filePath },
        });
      } catch (err) {
        results.push({
          id: idCounter++,
          verified: false,
          line: bp.line,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    record.breakpoints.set(filePath, results);
    return results;
  }

  // --- 3. Stepping & Execution Flow ---

  public async continue(sessionId: string): Promise<void> {
    const record = this.sessions.get(sessionId);
    if (!record) throw new AppError(ErrorCode.NOT_FOUND, "Debug session not found");
    if (record.session.status !== DebugSessionStatus.PAUSED) {
      return;
    }
    record.session.status = DebugSessionStatus.RUNNING;
    await this.sendV8(record, "Debugger.resume");
  }

  public async pause(sessionId: string): Promise<void> {
    const record = this.sessions.get(sessionId);
    if (!record) throw new AppError(ErrorCode.NOT_FOUND, "Debug session not found");
    if (record.session.status === DebugSessionStatus.PAUSED) {
      return;
    }
    await this.sendV8(record, "Debugger.pause");
  }

  public async stepOver(sessionId: string): Promise<void> {
    const record = this.sessions.get(sessionId);
    if (!record) throw new AppError(ErrorCode.NOT_FOUND, "Debug session not found");
    if (record.session.status !== DebugSessionStatus.PAUSED) {
      return;
    }
    await this.sendV8(record, "Debugger.stepOver");
  }

  public async stepIn(sessionId: string): Promise<void> {
    const record = this.sessions.get(sessionId);
    if (!record) throw new AppError(ErrorCode.NOT_FOUND, "Debug session not found");
    if (record.session.status !== DebugSessionStatus.PAUSED) {
      return;
    }
    await this.sendV8(record, "Debugger.stepInto");
  }

  public async stepOut(sessionId: string): Promise<void> {
    const record = this.sessions.get(sessionId);
    if (!record) throw new AppError(ErrorCode.NOT_FOUND, "Debug session not found");
    if (record.session.status !== DebugSessionStatus.PAUSED) {
      return;
    }
    await this.sendV8(record, "Debugger.stepOut");
  }

  // --- 4. Call Stack, Scopes, and Variables ---

  public getStackTrace(sessionId: string): StackFrame[] {
    const record = this.sessions.get(sessionId);
    if (!record) throw new AppError(ErrorCode.NOT_FOUND, "Debug session not found");

    return record.currentCallFrames.map((frame, index) => {
      const filePath = frame.url ? frame.url.replace(/^file:\/\//, "") : "";
      return {
        id: index,
        name: frame.functionName || "(anonymous)",
        source: filePath ? { path: filePath, name: path.basename(filePath) } : undefined,
        line: frame.location.lineNumber + 1,
        column: frame.location.columnNumber + 1,
      };
    });
  }

  public getScopes(sessionId: string, frameId = 0): Scope[] {
    const record = this.sessions.get(sessionId);
    if (!record) throw new AppError(ErrorCode.NOT_FOUND, "Debug session not found");

    const frame = record.currentCallFrames[frameId];
    if (!frame) return [];

    return frame.scopeChain.map((scope) => {
      let refId = 0;
      if (scope.object.objectId) {
        refId = record.nextVarRef++;
        record.variableReferences.set(refId, scope.object.objectId);
      }
      return {
        name: scope.type.charAt(0).toUpperCase() + scope.type.slice(1),
        variablesReference: refId,
      };
    });
  }

  public async getVariables(sessionId: string, variablesReference: number): Promise<Variable[]> {
    const record = this.sessions.get(sessionId);
    if (!record) throw new AppError(ErrorCode.NOT_FOUND, "Debug session not found");

    const objectId = record.variableReferences.get(variablesReference);
    if (!objectId) return [];

    try {
      const res = await this.sendV8(record, "Runtime.getProperties", {
        objectId,
        ownProperties: true,
      });

      if (!res || !res.result) return [];

      return res.result
        .filter((prop: any) => !prop.name.startsWith("__"))
        .map((prop: any) => {
          let refId = 0;
          if (prop.value?.objectId) {
            refId = record.nextVarRef++;
            record.variableReferences.set(refId, prop.value.objectId);
          }
          const val = prop.value
            ? prop.value.value !== undefined
              ? String(prop.value.value)
              : prop.value.description || prop.value.type
            : "undefined";

          return {
            name: prop.name,
            value: val,
            type: prop.value?.type,
            variablesReference: refId,
          };
        });
    } catch {
      return [];
    }
  }

  // --- 5. Expression Evaluation & Watch ---

  public async evaluate(dto: EvaluateDto): Promise<EvaluateResult> {
    const { sessionId, expression, frameId } = dto;
    const record = this.sessions.get(sessionId);
    if (!record) throw new AppError(ErrorCode.NOT_FOUND, "Debug session not found");

    try {
      let res: any;
      if (frameId !== undefined && record.currentCallFrames[frameId]) {
        res = await this.sendV8(record, "Debugger.evaluateOnCallFrame", {
          callFrameId: record.currentCallFrames[frameId]!.callFrameId,
          expression,
        });
      } else {
        res = await this.sendV8(record, "Runtime.evaluate", {
          expression,
        });
      }

      if (res && res.result) {
        const val =
          res.result.value !== undefined
            ? String(res.result.value)
            : res.result.description || res.result.type;
        return {
          result: val,
          type: res.result.type,
          variablesReference: 0,
        };
      }
      return { result: "undefined", variablesReference: 0 };
    } catch (err) {
      return {
        result: err instanceof Error ? err.message : String(err),
        variablesReference: 0,
      };
    }
  }

  // --- 6. Stop & Cleanup ---

  public async stop(sessionId: string): Promise<void> {
    const record = this.sessions.get(sessionId);
    if (!record) return;

    if (record.ws) {
      try {
        record.ws.close();
      } catch {
        // ignore
      }
    }

    if (record.process) {
      try {
        record.process.kill("SIGKILL");
      } catch {
        // ignore
      }
    }

    record.session.status = DebugSessionStatus.TERMINATED;
    this.sessions.delete(sessionId);
  }

  // --- 7. Event Subscriptions ---

  public onSessionEvent(
    sessionId: string,
    listener: (event: { type: string; body: unknown }) => void
  ): () => void {
    const record = this.sessions.get(sessionId);
    if (!record) return () => {};
    record.listeners.add(listener);
    return () => record.listeners.delete(listener);
  }

  private emitEvent(record: ActiveSessionRecord, type: string, body: unknown): void {
    for (const listener of record.listeners) {
      try {
        listener({ type, body });
      } catch (err) {
        logger.error({ err, type }, "Error dispatching debug event listener");
      }
    }
  }
}

export const dapManagerService = new DapManagerService();
