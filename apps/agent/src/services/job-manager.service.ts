import { spawn, ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  AppError,
  ErrorCode,
  CreateJobDto,
  JobDefinition,
  JobLifecycleEvent,
  JobLifecycleEventType,
  JobLogEntry,
  generateId,
  logger,
} from "@remote-ide/shared";

const MAX_LOG_CHARS_PER_JOB = 2_000_000;
const USE_PROCESS_GROUPS = process.platform !== "win32";

function quotePosixShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

// Jobs run through a shell, so signal the whole process group: signalling only the shell
// would leave `a && b` or `npm run x` grandchildren running after cancel/timeout.
function signalJobProcess(child: ChildProcess, signal: NodeJS.Signals): void {
  if (USE_PROCESS_GROUPS && child.pid) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // Group already gone; fall back to the direct child.
    }
  }
  child.kill(signal);
}

interface JobRecord {
  job: JobDefinition;
  process?: ChildProcess;
  logs: JobLogEntry[];
  logChars: number;
  maxLogEntries: number;
  timeoutTimer?: NodeJS.Timeout;
  logListeners: Set<(entry: JobLogEntry) => void>;
}

export interface JobManagerOptions {
  maxConcurrentJobs?: number;
  maxLogEntriesPerJob?: number;
  defaultTimeoutMs?: number;
}

export class JobManagerService {
  private jobs = new Map<string, JobRecord>();
  private pendingQueue: string[] = [];
  private eventListeners = new Set<(event: JobLifecycleEvent) => void>();
  private readonly maxConcurrentJobs: number;
  private readonly maxLogEntriesPerJob: number;
  private readonly defaultTimeoutMs: number;

  constructor(options: JobManagerOptions = {}) {
    this.maxConcurrentJobs = options.maxConcurrentJobs ?? 5;
    this.maxLogEntriesPerJob = options.maxLogEntriesPerJob ?? 5000;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 1800000;
  }

  public onEvent(listener: (event: JobLifecycleEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  private emitEvent(type: JobLifecycleEventType, job: JobDefinition): void {
    const event: JobLifecycleEvent = {
      type,
      jobId: job.id,
      timestamp: new Date().toISOString(),
      job: { ...job },
    };

    logger.info({ eventType: type, jobId: job.id, name: job.name }, "Job lifecycle event emitted");

    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (err) {
        logger.error({ err, eventType: type, jobId: job.id }, "Error notifying job event listener");
      }
    }
  }

  public async createJob(dto: CreateJobDto, ownerId: string): Promise<JobDefinition> {
    if (dto.idempotencyKey) {
      for (const record of this.jobs.values()) {
        if (
          record.job.idempotencyKey === dto.idempotencyKey &&
          (record.job.status === "running" || record.job.status === "pending")
        ) {
          logger.info(
            { idempotencyKey: dto.idempotencyKey, jobId: record.job.id },
            "Idempotent job reused"
          );
          return record.job;
        }
      }
    }

    const resolvedCwd = dto.cwd ? path.resolve(dto.cwd) : os.homedir();
    if (!fs.existsSync(resolvedCwd) || !fs.statSync(resolvedCwd).isDirectory()) {
      throw new AppError(ErrorCode.NOT_FOUND, `Working directory does not exist: ${resolvedCwd}`);
    }

    const jobId = generateId("job");
    const now = new Date().toISOString();

    const job: JobDefinition = {
      id: jobId,
      name: dto.name,
      command: dto.command,
      args: dto.args || [],
      cwd: resolvedCwd,
      owner: ownerId,
      status: "pending",
      idempotencyKey: dto.idempotencyKey,
      createdAt: now,
      timeoutMs: dto.timeoutMs || this.defaultTimeoutMs,
    };

    const record: JobRecord = {
      job,
      logs: [],
      logChars: 0,
      maxLogEntries: this.maxLogEntriesPerJob,
      logListeners: new Set(),
    };

    this.jobs.set(jobId, record);
    this.emitEvent("job.created", job);

    this.addLog(
      record,
      "system",
      `Job registered and queued: ${job.name} (${job.command} ${job.args.join(" ")})`
    );

    this.pendingQueue.push(jobId);
    this.processQueue();

    return job;
  }

  private processQueue(): void {
    const runningCount = Array.from(this.jobs.values()).filter(
      (r) => r.job.status === "running"
    ).length;

    if (runningCount >= this.maxConcurrentJobs) {
      return;
    }

    const nextJobId = this.pendingQueue.shift();
    if (!nextJobId) return;

    const record = this.jobs.get(nextJobId);
    if (!record || record.job.status !== "pending") {
      this.processQueue();
      return;
    }

    this.startJobProcess(record);
  }

  private startJobProcess(record: JobRecord): void {
    const { job } = record;
    job.status = "running";
    job.startedAt = new Date().toISOString();
    this.emitEvent("job.started", job);

    this.addLog(record, "system", `Starting process in ${job.cwd}...`);

    try {
      // `command` is a shell command line by design, but `args` are discrete values: quote
      // them so they cannot inject shell syntax (Node joins shell args unescaped).
      const commandLine =
        USE_PROCESS_GROUPS && job.args.length > 0
          ? [job.command, ...job.args.map(quotePosixShellArg)].join(" ")
          : job.command;
      const child = spawn(commandLine, USE_PROCESS_GROUPS ? [] : job.args, {
        cwd: job.cwd,
        shell: true,
        detached: USE_PROCESS_GROUPS,
        env: {
          ...process.env,
          REMOTE_IDE_JOB_ID: job.id,
          REMOTE_IDE_JOB_NAME: job.name,
        },
      });

      record.process = child;

      child.stdout?.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf-8");
        this.addLog(record, "stdout", text);
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf-8");
        this.addLog(record, "stderr", text);
      });

      if (job.timeoutMs && job.timeoutMs > 0) {
        record.timeoutTimer = setTimeout(() => {
          if (job.status === "running") {
            this.addLog(
              record,
              "system",
              `Job execution timed out after ${job.timeoutMs}ms. Terminating...`
            );
            void this.cancelJob(job.id, "Execution timeout exceeded");
          }
        }, job.timeoutMs);
      }

      child.on("error", (err) => {
        logger.error({ err, jobId: job.id }, "Child process error");
        job.error = err.message;
        this.finishJob(record, "failed", null, err.message);
      });

      child.on("close", (code) => {
        if (job.status === "cancelled") return;
        const status = code === 0 ? "completed" : "failed";
        this.finishJob(
          record,
          status,
          code,
          code !== 0 ? `Process exited with code ${code}` : undefined
        );
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown spawn error";
      this.addLog(record, "system", `Failed to spawn process: ${message}`);
      this.finishJob(record, "failed", null, message);
    }
  }

  private finishJob(
    record: JobRecord,
    status: "completed" | "failed" | "cancelled",
    exitCode: number | null,
    error?: string
  ): void {
    if (record.timeoutTimer) {
      clearTimeout(record.timeoutTimer);
      record.timeoutTimer = undefined;
    }

    const { job } = record;
    if (job.status !== "running" && job.status !== "pending") return;

    job.status = status;
    job.completedAt = new Date().toISOString();
    job.exitCode = exitCode;
    if (error) job.error = error;

    this.addLog(record, "system", `Job ${status} with exit code ${exitCode ?? "none"}`);

    if (status === "completed") {
      this.emitEvent("job.completed", job);
    } else if (status === "cancelled") {
      this.emitEvent("job.cancelled", job);
    } else {
      this.emitEvent("job.failed", job);
    }

    this.processQueue();
  }

  private addLog(record: JobRecord, stream: "stdout" | "stderr" | "system", data: string): void {
    const entry: JobLogEntry = {
      id: generateId("log"),
      jobId: record.job.id,
      timestamp: new Date().toISOString(),
      stream,
      data,
    };

    record.logs.push(entry);
    record.logChars += data.length;

    // Entries are raw output chunks, so bound total size as well as entry count.
    while (
      record.logs.length > 1 &&
      (record.logs.length > record.maxLogEntries || record.logChars > MAX_LOG_CHARS_PER_JOB)
    ) {
      record.logChars -= record.logs.shift()!.data.length;
    }

    for (const listener of record.logListeners) {
      try {
        listener(entry);
      } catch (err) {
        logger.error({ err, jobId: record.job.id }, "Error delivering job log to subscriber");
      }
    }
  }

  public async cancelJob(jobId: string, reason = "Cancelled by user"): Promise<JobDefinition> {
    const record = this.jobs.get(jobId);
    if (!record) {
      throw new AppError(ErrorCode.NOT_FOUND, `Job not found: ${jobId}`);
    }

    if (record.job.status === "pending") {
      this.pendingQueue = this.pendingQueue.filter((id) => id !== jobId);
      this.finishJob(record, "cancelled", null, reason);
      return record.job;
    }

    if (record.job.status === "running" && record.process) {
      this.finishJob(record, "cancelled", null, reason);
      const child = record.process;
      try {
        signalJobProcess(child, "SIGTERM");
        setTimeout(() => {
          // The shell may already be gone while grandchildren in its group are not.
          if (USE_PROCESS_GROUPS || (child.exitCode === null && child.signalCode === null)) {
            try {
              signalJobProcess(child, "SIGKILL");
            } catch {
              // Already exited.
            }
          }
        }, 500);
      } catch (err) {
        logger.warn({ err, jobId }, "Error killing job process");
      }
    }

    return record.job;
  }

  public async retryJob(jobId: string, ownerId: string): Promise<JobDefinition> {
    const record = this.jobs.get(jobId);
    if (!record) {
      throw new AppError(ErrorCode.NOT_FOUND, `Job not found: ${jobId}`);
    }

    return this.createJob(
      {
        name: record.job.name,
        command: record.job.command,
        args: record.job.args,
        cwd: record.job.cwd,
        timeoutMs: record.job.timeoutMs,
      },
      ownerId
    );
  }

  public getJob(jobId: string): JobDefinition {
    const record = this.jobs.get(jobId);
    if (!record) {
      throw new AppError(ErrorCode.NOT_FOUND, `Job not found: ${jobId}`);
    }
    return record.job;
  }

  public getJobLogs(jobId: string): JobLogEntry[] {
    const record = this.jobs.get(jobId);
    if (!record) {
      throw new AppError(ErrorCode.NOT_FOUND, `Job not found: ${jobId}`);
    }
    return record.logs;
  }

  public subscribeLogs(
    jobId: string,
    listener: (entry: JobLogEntry) => void
  ): { logs: JobLogEntry[]; unsubscribe: () => void } {
    const record = this.jobs.get(jobId);
    if (!record) {
      throw new AppError(ErrorCode.NOT_FOUND, `Job not found: ${jobId}`);
    }

    record.logListeners.add(listener);
    return {
      logs: [...record.logs],
      unsubscribe: () => record.logListeners.delete(listener),
    };
  }

  public listJobs(): JobDefinition[] {
    return Array.from(this.jobs.values()).map((r) => r.job);
  }

  public async shutdownAll(): Promise<void> {
    logger.info("Terminating all active background jobs...");
    const runningJobs = Array.from(this.jobs.values()).filter((r) => r.job.status === "running");
    await Promise.all(runningJobs.map((r) => this.cancelJob(r.job.id, "Host agent shutting down")));
  }
}

export const jobManagerService = new JobManagerService();
