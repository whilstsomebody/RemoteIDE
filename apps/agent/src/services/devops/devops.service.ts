import { exec } from "node:child_process";
import { promisify } from "node:util";
import net from "node:net";
import {
  DevOpsOverview,
  Pm2Overview,
  Pm2Process,
  KubernetesOverview,
  KubernetesContext,
  SshProfile,
  generateId,
  AppError,
  ErrorCode,
} from "@remote-ide/shared";

const execAsync = promisify(exec);

export class DevOpsService {
  private sshProfiles = new Map<string, SshProfile>();

  constructor() {
    // Seed a sample local host SSH profile interface
    const defaultSsh: SshProfile = {
      id: "ssh-local",
      name: "Local Host SSH",
      host: "127.0.0.1",
      port: 22,
      username: process.env.USER || "developer",
      authType: "key",
      status: "configured",
    };
    this.sshProfiles.set(defaultSsh.id, defaultSsh);
  }

  public async getOverview(): Promise<DevOpsOverview> {
    const [pm2, kubernetes] = await Promise.all([
      this.getPm2Overview(),
      this.getKubernetesOverview(),
    ]);

    return {
      pm2,
      kubernetes,
      sshProfiles: this.listSshProfiles(),
      composeCount: 0,
    };
  }

  // --- 1. PM2 Adapter ---

  public async getPm2Overview(): Promise<Pm2Overview> {
    try {
      const { stdout } = await execAsync("pm2 jlist", { timeout: 4000 });
      const rawList = JSON.parse(stdout);
      if (!Array.isArray(rawList)) {
        return { isAvailable: false, processes: [] };
      }

      const processes: Pm2Process[] = rawList.map((p: any) => ({
        id: p.pm_id ?? 0,
        name: p.name || `pm2-${p.pm_id}`,
        pid: p.pid,
        status: (p.pm2_env?.status || "stopped") as any,
        cpuPercent: p.monit?.cpu || 0,
        memoryBytes: p.monit?.memory || 0,
        uptimeSeconds: p.pm2_env?.pm_uptime
          ? Math.floor((Date.now() - p.pm2_env.pm_uptime) / 1000)
          : 0,
        restarts: p.pm2_env?.restart_time || 0,
      }));

      return {
        isAvailable: true,
        processes,
      };
    } catch {
      return {
        isAvailable: false,
        error: "PM2 not installed or daemon offline",
        processes: [],
      };
    }
  }

  public async restartPm2(nameOrId: string): Promise<void> {
    if (!/^[a-zA-Z0-9_.-]+$/.test(nameOrId)) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid PM2 process name or ID");
    }
    try {
      await execAsync(`pm2 restart ${nameOrId}`, { timeout: 10000 });
    } catch (err) {
      throw new AppError(
        ErrorCode.INTERNAL_SERVER_ERROR,
        `Failed to restart PM2 process: ${(err as Error).message}`
      );
    }
  }

  public async stopPm2(nameOrId: string): Promise<void> {
    if (!/^[a-zA-Z0-9_.-]+$/.test(nameOrId)) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid PM2 process name or ID");
    }
    try {
      await execAsync(`pm2 stop ${nameOrId}`, { timeout: 10000 });
    } catch (err) {
      throw new AppError(
        ErrorCode.INTERNAL_SERVER_ERROR,
        `Failed to stop PM2 process: ${(err as Error).message}`
      );
    }
  }

  // --- 2. Kubernetes Adapter ---

  public async getKubernetesOverview(): Promise<KubernetesOverview> {
    try {
      const { stdout } = await execAsync("kubectl config view -o json", { timeout: 4000 });
      const raw = JSON.parse(stdout);
      const contextsRaw = raw.contexts || [];
      const currentContext = raw["current-context"] || "";

      const contexts: KubernetesContext[] = contextsRaw.map((c: any) => ({
        name: c.name,
        cluster: c.context?.cluster || "",
        user: c.context?.user || "",
        namespace: c.context?.namespace,
        isCurrent: c.name === currentContext,
      }));

      return {
        isAvailable: true,
        currentContext,
        contexts,
      };
    } catch {
      return {
        isAvailable: false,
        error: "kubectl not available or no kubeconfig found",
        contexts: [],
      };
    }
  }

  // --- 3. SSH Server Profiles Adapter ---

  public listSshProfiles(): SshProfile[] {
    return Array.from(this.sshProfiles.values());
  }

  public addSshProfile(dto: {
    name: string;
    host: string;
    port?: number;
    username: string;
    authType?: "key" | "agent" | "password";
  }): SshProfile {
    const id = generateId("ssh");
    const profile: SshProfile = {
      id,
      name: dto.name,
      host: dto.host,
      port: dto.port || 22,
      username: dto.username,
      authType: dto.authType || "key",
      status: "configured",
    };
    this.sshProfiles.set(id, profile);
    return profile;
  }

  public deleteSshProfile(id: string): boolean {
    return this.sshProfiles.delete(id);
  }

  public async testSshConnection(id: string): Promise<SshProfile> {
    const profile = this.sshProfiles.get(id);
    if (!profile) {
      throw new AppError(ErrorCode.NOT_FOUND, `SSH profile ${id} not found`);
    }

    try {
      // Safe TCP connect probe to SSH port
      await new Promise<void>((resolve, reject) => {
        const socket = new net.Socket();
        socket.setTimeout(3000);
        socket.once("connect", () => {
          socket.destroy();
          resolve();
        });
        socket.once("timeout", () => {
          socket.destroy();
          reject(new Error("Connection timed out"));
        });
        socket.once("error", (err) => {
          socket.destroy();
          reject(err);
        });
        socket.connect(profile.port, profile.host);
      });

      profile.status = "connected";
      profile.lastTestedAt = new Date().toISOString();
      profile.errorMessage = undefined;
    } catch (err) {
      profile.status = "error";
      profile.lastTestedAt = new Date().toISOString();
      profile.errorMessage = (err as Error).message;
    }

    return { ...profile };
  }
}

export const devOpsService = new DevOpsService();
