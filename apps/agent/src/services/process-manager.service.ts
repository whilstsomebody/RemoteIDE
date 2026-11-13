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
  process: ManagedProcess;
  child?: ChildProcess;
  logs: Array<{ timestamp: string; stream: "stdout" | "stderr"; text: string }>;
  logListeners: Set<
    (entry: { timestamp: string; stream: "stdout" | "stderr"; text: string }) => void
  >;
}

export class ProcessManagerService {
  private processes = new Map<string, ProcessRecord>();
  private readonly MAX_LOG_LINES = 2000;

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

  /**
   * List all processes for a workspace or all if owner.
   */
  public async listProcesses(workspaceId?: string): Promise<ManagedProcess[]> {
    const list: ManagedProcess[] = [];
    for (const record of this.processes.values()) {
      if (!workspaceId || record.process.workspaceId === workspaceId) {
        // Update live stats if process is running
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

  /**
   * Get a specific managed process.
   */
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

  /**
   * Start a new managed development process.
   */
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
      logs: [],
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
        if (record.logs.length > this.MAX_LOG_LINES) {
          record.logs.splice(0, record.logs.length - this.MAX_LOG_LINES);
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
        logger.error({ err, procId: proc.id }, "Managed process error");
        proc.status = "crashed";
        proc.stoppedAt = new Date().toISOString();
        appendLog("stderr", Buffer.from(`\nProcess error: ${err.message}\n`));
      });

      child.on("close", (code, signal) => {
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
      record.logs.push({
        timestamp: new Date().toISOString(),
        stream: "stderr",
        text: `Spawn failed: ${message}\n`,
      });
    }
  }

  /**
   * Stop a running process (graceful SIGTERM, followed by SIGKILL).
   */
  public async stopProcess(id: string): Promise<ManagedProcess> {
    const record = this.processes.get(id);
    if (!record) {
      throw new AppError(ErrorCode.NOT_FOUND, `Managed process not found: ${id}`);
    }

    if (record.child && record.process.status === "running") {
      const child = record.child;
      record.process.status = "stopped";
      record.process.stoppedAt = new Date().toISOString();
      child.kill("SIGTERM");

      // Give 3 seconds grace period before SIGKILL
      setTimeout(() => {
        if (record.child) {
          try {
            record.child.kill("SIGKILL");
          } catch {
            // Process may already be dead
          }
        }
      }, 3000);
    } else {
      record.process.status = "stopped";
      record.process.stoppedAt = new Date().toISOString();
    }

    return { ...record.process };
  }

  /**
   * Restart a process.
   */
  public async restartProcess(id: string): Promise<ManagedProcess> {
    const record = this.processes.get(id);
    if (!record) {
      throw new AppError(ErrorCode.NOT_FOUND, `Managed process not found: ${id}`);
    }

    if (record.child && record.process.status === "running") {
      await this.stopProcess(id);
      // Wait a moment for termination
      await new Promise((r) => setTimeout(r, 500));
    }

    record.process.restartCount += 1;
    record.process.startedAt = new Date().toISOString();
    record.process.status = "starting";

    this.spawnChild(record, { ...process.env });

    return { ...record.process };
  }

  /**
   * Get logs for a process.
   */
  public getLogs(
    id: string
  ): Array<{ timestamp: string; stream: "stdout" | "stderr"; text: string }> {
    const record = this.processes.get(id);
    if (!record) {
      throw new AppError(ErrorCode.NOT_FOUND, `Managed process not found: ${id}`);
    }
    return [...record.logs];
  }

  /**
   * Stream live logs for a process.
   */
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

  /**
   * Get CPU and memory stats for a PID.
   */
  private async getProcessStats(pid: number, startedAt: string): Promise<ProcessStats> {
    const uptimeSeconds = Math.max(
      0,
      Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
    );
    try {
      // Use standard `ps` on macOS / Linux
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

  /**
   * Clean shutdown of all running processes.
   */
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
