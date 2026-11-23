import { spawn, ChildProcess } from "node:child_process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs";
import {
  AppError,
  ErrorCode,
  ManagedProcess,
  ProcessStats,
  StartProcessDto,
  generateId,
  logger,
} from "@remote-ide/shared";

const execFileAsync = promisify(execFile);

interface ProcessRecord {
  env: NodeJS.ProcessEnv;
  stopping?: Promise<void>;
  process: ManagedProcess;
  child?: ChildProcess;
  logs: Array<{ timestamp: string; stream: "stdout" | "stderr"; text: string }>;
  logChars: number;
  logListeners: Set<
    (entry: { timestamp: string; stream: "stdout" | "stderr"; text: string }) => void
  >;
}

export class ProcessManagerService {
  private processes = new Map<string, ProcessRecord>();
  private readonly MAX_LOG_LINES = 2000;
  // Entries are raw stdout chunks (up to 64KB each), so a line cap alone does not bound memory.
  private readonly MAX_LOG_CHARS = 2_000_000;

  constructor(private readonly allowedPaths: string[] = []) {}

  /**
   * Mask sensitive environment variable values to prevent secret leakage.
   */
  public maskEnv(env: Record<string, string>): Record<string, string> {
    const sensitivePattern = /(KEY|SECRET|TOKEN|PASSWORD|PASS|AUTH|CREDENTIAL|PRIVATE|SALT|CERT)/i;
    const masked: Record<string, string> = {};
    for (const [k, v] of Object.entries(env)) {
      if (sensitivePattern.test(k)) {
        masked[k] =
          v.length > 4 ? `${v.substring(0, 2)}••••••••${v.substring(v.length - 2)}` : "••••••••";
      } else {
        masked[k] = v;
      }
    }
    return masked;
  }

  public async listProcesses(workspaceId?: string): Promise<ManagedProcess[]> {
    const list: ManagedProcess[] = [];
    for (const record of this.processes.values()) {
      if (!workspaceId || record.process.workspaceId === workspaceId) {
        if (record.process.status === "running" && record.process.pid) {
          record.process.stats = await this.getProcessStats(
            record.process.pid,
            record.process.startedAt
          );
        }
        list.push({ ...record.process });
      }
    }
    return list;
  }

  public async getProcess(id: string): Promise<ManagedProcess> {
    const record = this.processes.get(id);
    if (!record) {
      throw new AppError(ErrorCode.NOT_FOUND, `Managed process not found: ${id}`);
    }
    if (record.process.status === "running" && record.process.pid) {
      record.process.stats = await this.getProcessStats(
        record.process.pid,
        record.process.startedAt
      );
    }
    return { ...record.process };
  }

  public async startProcess(dto: StartProcessDto): Promise<ManagedProcess> {
    const cwd = dto.cwd ? path.resolve(dto.cwd) : process.cwd();
    if (!fs.existsSync(cwd)) {
      throw new AppError(ErrorCode.NOT_FOUND, `Working directory does not exist: ${cwd}`);
    }

    if (this.allowedPaths.length > 0) {
      const isAllowed = this.allowedPaths.some(
        (allowed) => cwd === allowed || cwd.startsWith(allowed + path.sep)
      );
      if (!isAllowed) {
        throw new AppError(
          ErrorCode.FORBIDDEN,
          `Working directory is outside allowed paths: ${cwd}`
        );
      }
    }

    const id = generateId("proc");
    const rawEnv = { ...process.env, ...(dto.env || {}) };
    const maskedEnv = this.maskEnv(dto.env || {});

    const managed: ManagedProcess = {
      id,
      workspaceId: dto.workspaceId,
      name: dto.name,
      command: dto.command,
      args: dto.args || [],
      cwd,
      status: "starting",
      startedAt: new Date().toISOString(),
      env: maskedEnv,
      restartCount: 0,
      stats: {
        cpuPercent: 0,
        memoryMb: 0,
        uptimeSeconds: 0,
      },
    };

    const record: ProcessRecord = {
      process: managed,
      env: rawEnv,
      logs: [],
      logChars: 0,
      logListeners: new Set(),
    };
    this.processes.set(id, record);

    this.spawnChild(record, rawEnv);

    return { ...record.process };
  }

  private spawnChild(record: ProcessRecord, env: NodeJS.ProcessEnv): void {
    const { process: proc } = record;

    try {
      const child = spawn(proc.command, proc.args, {
        cwd: proc.cwd,
        env,
        stdio: ["ignore", "pipe", "pipe"],
        detached: false,
      });

      record.child = child;
      proc.pid = child.pid;
      proc.status = "running";
      proc.exitCode = null;
      proc.signal = null;

      const appendLog = (stream: "stdout" | "stderr", data: Buffer) => {
        const text = data.toString("utf-8");
        const entry = {
          timestamp: new Date().toISOString(),
          stream,
          text,
        };
        record.logs.push(entry);
        record.logChars += text.length;
        while (
          record.logs.length > 1 &&
          (record.logs.length > this.MAX_LOG_LINES || record.logChars > this.MAX_LOG_CHARS)
        ) {
          record.logChars -= record.logs.shift()!.text.length;
        }
        for (const listener of record.logListeners) {
          try {
            listener(entry);
          } catch {
            // Ignored
          }
        }
      };

      child.stdout?.on("data", (data) => appendLog("stdout", data));
      child.stderr?.on("data", (data) => appendLog("stderr", data));

      child.on("error", (err) => {
        if (record.child !== child) return;
        logger.error({ err, procId: proc.id }, "Managed process error");
        proc.status = "crashed";
        proc.stoppedAt = new Date().toISOString();
        appendLog("stderr", Buffer.from(`\nProcess error: ${err.message}\n`));
      });

      child.on("close", (code, signal) => {
        if (record.child !== child) return;
        proc.exitCode = code;
        proc.signal = signal;
        proc.stoppedAt = new Date().toISOString();
        if (code !== 0 && code !== null) {
          proc.status = "crashed";
        } else {
          proc.status = "stopped";
        }
        record.child = undefined;
        appendLog("stdout", Buffer.from(`\nProcess exited with code ${code ?? signal}\n`));
      });
    } catch (err: unknown) {
      proc.status = "crashed";
      proc.stoppedAt = new Date().toISOString();
      const message = err instanceof Error ? err.message : "Failed to spawn process";
      const text = `Spawn failed: ${message}\n`;
      record.logs.push({ timestamp: new Date().toISOString(), stream: "stderr", text });
      record.logChars += text.length;
    }
  }

  public async stopProcess(id: string): Promise<ManagedProcess> {
    const record = this.processes.get(id);
    if (!record) {
      throw new AppError(ErrorCode.NOT_FOUND, `Managed process not found: ${id}`);
    }

    if (record.stopping) {
      await record.stopping;
    } else if (record.child) {
      const child = record.child;
      record.stopping = new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
        }, 3000);
        child.once("close", () => { clearTimeout(timer); resolve(); });
        child.kill("SIGTERM");
      });
      try { await record.stopping; } finally { record.stopping = undefined; }
    }
    record.process.status = "stopped";
    record.process.stoppedAt = new Date().toISOString();

    return { ...record.process };
  }

  public async restartProcess(id: string): Promise<ManagedProcess> {
    const record = this.processes.get(id);
    if (!record) {
      throw new AppError(ErrorCode.NOT_FOUND, `Managed process not found: ${id}`);
    }

    if (record.child || record.stopping) await this.stopProcess(id);

    record.process.restartCount += 1;
    record.process.startedAt = new Date().toISOString();
    record.process.status = "starting";

    this.spawnChild(record, record.env);

    return { ...record.process };
  }

  public getLogs(
    id: string
  ): Array<{ timestamp: string; stream: "stdout" | "stderr"; text: string }> {
    const record = this.processes.get(id);
    if (!record) {
      throw new AppError(ErrorCode.NOT_FOUND, `Managed process not found: ${id}`);
    }
    return [...record.logs];
  }

  public subscribeLogs(
    id: string,
    listener: (entry: { timestamp: string; stream: "stdout" | "stderr"; text: string }) => void
  ): () => void {
    const record = this.processes.get(id);
    if (!record) {
      throw new AppError(ErrorCode.NOT_FOUND, `Managed process not found: ${id}`);
    }
    record.logListeners.add(listener);
    return () => record.logListeners.delete(listener);
  }

  private async getProcessStats(pid: number, startedAt: string): Promise<ProcessStats> {
    const uptimeSeconds = Math.max(
      0,
      Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
    );
    try {
      const { stdout } = await execFileAsync("ps", ["-p", String(pid), "-o", "%cpu,rss"]);
      const lines = stdout.trim().split("\n");
      if (lines.length >= 2 && lines[1]) {
        const parts = lines[1].trim().split(/\s+/);
        const cpuPercent = parseFloat(parts[0] || "0") || 0;
        const memoryKb = parseInt(parts[1] || "0", 10) || 0;
        return {
          cpuPercent,
          memoryMb: Math.round((memoryKb / 1024) * 10) / 10,
          uptimeSeconds,
        };
      }
    } catch {
      // Process might have terminated
    }

    return {
      cpuPercent: 0,
      memoryMb: 0,
      uptimeSeconds,
    };
  }

  public shutdown(): void {
    for (const record of this.processes.values()) {
      if (record.child) {
        try {
          record.child.kill("SIGTERM");
        } catch {
          // Ignored
        }
      }
    }
  }
}

export const processManagerService = new ProcessManagerService();
