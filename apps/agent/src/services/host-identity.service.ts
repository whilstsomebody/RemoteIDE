import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { generateId } from "@remote-ide/shared";

export interface HostIdentity {
  hostId: string;
  hostName: string;
  platform: string;
  arch: string;
  createdAt: string;
  lastStartedAt: string;
}

export class HostIdentityService {
  private identity: HostIdentity;
  private readonly configPath: string;

  constructor(storageDir: string = "./data", hostIdOverride?: string) {
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }

    this.configPath = path.join(storageDir, "host-identity.json");
    this.identity = this.loadOrCreateIdentity(hostIdOverride);
  }

  private loadOrCreateIdentity(hostIdOverride?: string): HostIdentity {
    const now = new Date().toISOString();
    const desiredHostId = hostIdOverride || process.env.HOST_IDENTIFIER;

    if (fs.existsSync(this.configPath)) {
      try {
        const raw = fs.readFileSync(this.configPath, "utf-8");
        const parsed = JSON.parse(raw) as HostIdentity;
        parsed.lastStartedAt = now;
        if (desiredHostId && parsed.hostId !== desiredHostId) {
          parsed.hostId = desiredHostId;
        }
        fs.writeFileSync(this.configPath, JSON.stringify(parsed, null, 2), "utf-8");
        return parsed;
      } catch {
        // Fall back to creating a new identity if corrupted
      }
    }

    const newIdentity: HostIdentity = {
      hostId: desiredHostId || generateId("host"),
      hostName: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      createdAt: now,
      lastStartedAt: now,
    };

    fs.writeFileSync(this.configPath, JSON.stringify(newIdentity, null, 2), "utf-8");
    return newIdentity;
  }

  public getIdentity(): HostIdentity {
    return { ...this.identity };
  }

  public getHostId(): string {
    return this.identity.hostId;
  }
}
