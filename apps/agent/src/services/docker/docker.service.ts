import { exec, execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  DockerOverview,
  DockerContainer,
  DockerImage,
  DockerNetwork,
  DockerVolume,
  DockerComposeProject,
  DockerLogsDto,
  DockerExecDto,
  AppError,
  ErrorCode,
  logger,
} from "@remote-ide/shared";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

export class DockerService {
  private isDockerAvailable = false;
  private dockerVersion = "";
  private lastError = "";
  private lastChecked = 0;

  constructor() {}

  public async checkAvailability(force = false): Promise<boolean> {
    const now = Date.now();
    if (!force && now - this.lastChecked < 10000 && this.isDockerAvailable) {
      return this.isDockerAvailable;
    }
    this.lastChecked = now;

    try {
      const { stdout } = await execAsync("docker version --format '{{.Server.Version}}'", {
        timeout: 4000,
      });
      this.isDockerAvailable = true;
      this.dockerVersion = stdout.trim() || "Docker Engine";
      this.lastError = "";
      return true;
    } catch (err) {
      this.isDockerAvailable = false;
      this.dockerVersion = "";
      this.lastError = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  public async getOverview(): Promise<DockerOverview> {
    const available = await this.checkAvailability();
    if (!available) {
      return {
        isAvailable: false,
        error: this.lastError || "Docker daemon not running or not accessible",
        containerCount: 0,
        runningCount: 0,
        imageCount: 0,
        volumeCount: 0,
        composeCount: 0,
      };
    }

    try {
      const containers = await this.listContainers(true).catch(() => []);
      const [images, volumes, compose] = await Promise.all([
        this.listImages().catch(() => []),
        this.listVolumes().catch(() => []),
        this.listComposeProjects(containers).catch(() => []),
      ]);

      const runningCount = containers.filter((c) => c.state === "running").length;

      return {
        isAvailable: true,
        dockerVersion: this.dockerVersion,
        containerCount: containers.length,
        runningCount,
        imageCount: images.length,
        volumeCount: volumes.length,
        composeCount: compose.length,
      };
    } catch (err) {
      return {
        isAvailable: false,
        error: (err as Error).message,
        containerCount: 0,
        runningCount: 0,
        imageCount: 0,
        volumeCount: 0,
        composeCount: 0,
      };
    }
  }

  public async listContainers(all = true): Promise<DockerContainer[]> {
    const available = await this.checkAvailability();
    if (!available) return [];

    try {
      const flag = all ? "-a" : "";
      const { stdout } = await execAsync(`docker ps ${flag} --format '{{json .}}'`, {
        timeout: 5000,
      });

      const lines = stdout.trim().split("\n").filter(Boolean);
      const containers: DockerContainer[] = [];

      for (const line of lines) {
        try {
          const raw = JSON.parse(line);
          const ports = this.parsePorts(raw.Ports || "");
          const stateStr = (raw.State || "running").toLowerCase();
          const state = ["running", "paused", "restarting", "removing", "exited", "dead"].includes(
            stateStr
          )
            ? (stateStr as any)
            : "created";

          const statusStr = raw.Status || "";
          let health: "healthy" | "unhealthy" | "starting" | "none" = "none";
          if (statusStr.includes("(healthy)")) health = "healthy";
          else if (statusStr.includes("(unhealthy)")) health = "unhealthy";
          else if (statusStr.includes("(health: starting)")) health = "starting";

          containers.push({
            id: raw.ID || "",
            name: (raw.Names || "").replace(/^\//, ""),
            image: raw.Image || "",
            command: raw.Command,
            state,
            status: raw.Status || "",
            created: raw.CreatedAt || "",
            ports,
            health,
            composeProject: raw.Labels
              ? this.parseLabel(raw.Labels, "com.docker.compose.project")
              : undefined,
            composeService: raw.Labels
              ? this.parseLabel(raw.Labels, "com.docker.compose.service")
              : undefined,
          });
        } catch {
          // Skip invalid lines
        }
      }

      return containers;
    } catch (err) {
      logger.error({ err }, "Error listing docker containers");
      return [];
    }
  }

  private parsePorts(
    portsStr: string
  ): Array<{ hostIp?: string; hostPort?: number; containerPort: number; protocol: "tcp" | "udp" }> {
    if (!portsStr) return [];
    const results: Array<{
      hostIp?: string;
      hostPort?: number;
      containerPort: number;
      protocol: "tcp" | "udp";
    }> = [];
    const parts = portsStr.split(",").map((p) => p.trim());

    for (const part of parts) {
      // e.g. 0.0.0.0:8080->80/tcp or 80/tcp or :::8080->80/tcp
      const arrowMatch = part.match(/(?:([0-9.]+):)?([0-9]+)->([0-9]+)\/([a-z]+)/i);
      if (arrowMatch) {
        results.push({
          hostIp: arrowMatch[1],
          hostPort: parseInt(arrowMatch[2]!, 10),
          containerPort: parseInt(arrowMatch[3]!, 10),
          protocol: arrowMatch[4]!.toLowerCase() === "udp" ? "udp" : "tcp",
        });
      } else {
        const simpleMatch = part.match(/([0-9]+)\/([a-z]+)/i);
        if (simpleMatch) {
          results.push({
            containerPort: parseInt(simpleMatch[1]!, 10),
            protocol: simpleMatch[2]!.toLowerCase() === "udp" ? "udp" : "tcp",
          });
        }
      }
    }
    return results;
  }

  private parseLabel(labelsStr: string, key: string): string | undefined {
    const match = labelsStr.match(new RegExp(`${key}=([^,]+)`));
    return match ? match[1] : undefined;
  }

  public async startContainer(containerId: string): Promise<void> {
    await this.ensureDockerAvailable();
    this.validateIdentifier(containerId);
    try {
      await execFileAsync("docker", ["start", containerId], { timeout: 10000 });
    } catch (err) {
      throw new AppError(
        ErrorCode.INTERNAL_SERVER_ERROR,
        `Failed to start container: ${(err as Error).message}`
      );
    }
  }

  public async stopContainer(containerId: string): Promise<void> {
    await this.ensureDockerAvailable();
    this.validateIdentifier(containerId);
    try {
      await execFileAsync("docker", ["stop", "-t", "5", containerId], { timeout: 12000 });
    } catch (err) {
      throw new AppError(
        ErrorCode.INTERNAL_SERVER_ERROR,
        `Failed to stop container: ${(err as Error).message}`
      );
    }
  }

  public async restartContainer(containerId: string): Promise<void> {
    await this.ensureDockerAvailable();
    this.validateIdentifier(containerId);
    try {
      await execFileAsync("docker", ["restart", "-t", "5", containerId], { timeout: 15000 });
    } catch (err) {
      throw new AppError(
        ErrorCode.INTERNAL_SERVER_ERROR,
        `Failed to restart container: ${(err as Error).message}`
      );
    }
  }

  public async getContainerLogs(dto: DockerLogsDto): Promise<string> {
    await this.ensureDockerAvailable();
    this.validateIdentifier(dto.containerId);
    // execFile (no shell): `since` is free-form client input and was previously
    // interpolated into a shell string, allowing command injection.
    const args = ["logs", "--tail", String(dto.tail || 200)];
    if (dto.timestamps) args.push("-t");
    if (dto.since) args.push(`--since=${dto.since}`);
    args.push(dto.containerId);

    try {
      const { stdout, stderr } = await execFileAsync("docker", args, { timeout: 8000 });
      return stdout + (stderr ? `\n${stderr}` : "");
    } catch (err) {
      throw new AppError(
        ErrorCode.INTERNAL_SERVER_ERROR,
        `Failed to fetch logs: ${(err as Error).message}`
      );
    }
  }

  public async getContainerStats(
    containerId: string
  ): Promise<{ cpuPercent: number; memoryBytes: number; memoryLimitBytes: number }> {
    await this.ensureDockerAvailable();
    this.validateIdentifier(containerId);

    try {
      const { stdout } = await execFileAsync(
        "docker",
        ["stats", "--no-stream", "--format", "{{json .}}", containerId],
        { timeout: 5000 }
      );
      const raw = JSON.parse(stdout.trim());
      const cpu = parseFloat((raw.CPUPerc || "0").replace("%", "")) || 0;
      return {
        cpuPercent: cpu,
        memoryBytes: 0,
        memoryLimitBytes: 0,
      };
    } catch {
      return { cpuPercent: 0, memoryBytes: 0, memoryLimitBytes: 0 };
    }
  }

  public async listImages(): Promise<DockerImage[]> {
    const available = await this.checkAvailability();
    if (!available) return [];

    try {
      const { stdout } = await execAsync(`docker images --format '{{json .}}'`, { timeout: 5000 });
      const lines = stdout.trim().split("\n").filter(Boolean);
      return lines.map((l) => {
        const raw = JSON.parse(l);
        return {
          id: raw.ID || "",
          repository: raw.Repository || "",
          tag: raw.Tag || "",
          sizeBytes: 0,
          created: raw.CreatedAt || raw.CreatedSince || "",
        };
      });
    } catch {
      return [];
    }
  }

  public async listVolumes(): Promise<DockerVolume[]> {
    const available = await this.checkAvailability();
    if (!available) return [];

    try {
      const { stdout } = await execAsync(`docker volume ls --format '{{json .}}'`, {
        timeout: 5000,
      });
      const lines = stdout.trim().split("\n").filter(Boolean);
      return lines.map((l) => {
        const raw = JSON.parse(l);
        return {
          name: raw.Name || "",
          driver: raw.Driver || "local",
          mountpoint: raw.Mountpoint || "",
        };
      });
    } catch {
      return [];
    }
  }

  public async listNetworks(): Promise<DockerNetwork[]> {
    const available = await this.checkAvailability();
    if (!available) return [];

    try {
      const { stdout } = await execAsync(`docker network ls --format '{{json .}}'`, {
        timeout: 5000,
      });
      const lines = stdout.trim().split("\n").filter(Boolean);
      return lines.map((l) => {
        const raw = JSON.parse(l);
        return {
          id: raw.ID || "",
          name: raw.Name || "",
          driver: raw.Driver || "",
          scope: raw.Scope || "",
        };
      });
    } catch {
      return [];
    }
  }

  public async listComposeProjects(
    existingContainers?: DockerContainer[]
  ): Promise<DockerComposeProject[]> {
    const available = await this.checkAvailability();
    if (!available) return [];

    try {
      const { stdout } = await execAsync(`docker compose ls --format json`, { timeout: 4000 });
      const list = JSON.parse(stdout || "[]");
      if (!Array.isArray(list)) return [];

      const containers = existingContainers || (await this.listContainers(true));
      return list.map((item: any) => {
        const name = item.Name || item.name || "";
        const projectContainers = containers.filter((c) => c.composeProject === name);
        const services = projectContainers.map((c) => ({
          name: c.composeService || c.name,
          containerId: c.id,
          image: c.image,
          status: c.status,
          state: c.state,
        }));

        return {
          name,
          configFile: item.ConfigFiles || item.configFiles || "",
          status: item.Status || item.status || "running",
          services,
        };
      });
    } catch {
      return [];
    }
  }

  public async execContainer(
    dto: DockerExecDto
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    await this.ensureDockerAvailable();
    this.validateIdentifier(dto.containerId);

    try {
      const { stdout, stderr } = await execFileAsync(
        "docker",
        ["exec", dto.containerId, ...dto.command],
        { timeout: 15000 }
      );
      return { stdout, stderr, exitCode: 0 };
    } catch (err: any) {
      return {
        stdout: err.stdout || "",
        stderr: err.stderr || err.message,
        exitCode: typeof err.code === "number" ? err.code : 1,
      };
    }
  }

  private async ensureDockerAvailable(): Promise<void> {
    const available = await this.checkAvailability();
    if (!available) {
      throw new AppError(
        ErrorCode.SERVICE_UNAVAILABLE,
        `Docker is not accessible on this host: ${this.lastError || "daemon not running"}`
      );
    }
  }

  private validateIdentifier(id: string): void {
    // Must not start with "-" or it would be parsed as a docker CLI flag.
    if (!/^[a-zA-Z0-9_.][a-zA-Z0-9_.-]*$/.test(id)) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, `Invalid docker container identifier`);
    }
  }
}

export const dockerService = new DockerService();
