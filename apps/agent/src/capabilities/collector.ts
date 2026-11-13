import os from "node:os";
import { HostAgentCapabilities } from "@remote-ide/shared";

export function collectHostCapabilities(allowedPaths: string[] = []): HostAgentCapabilities {
  const platform = os.platform();
  const validPlatform =
    platform === "darwin" || platform === "linux" || platform === "win32" ? platform : "linux";

  return {
    version: "0.1.0",
    os: {
      platform: validPlatform,
      arch: os.arch(),
      release: os.release(),
      hostname: os.hostname(),
    },
    runtime: {
      nodeVersion: process.version,
      shellPath: process.env.SHELL || "/bin/sh",
    },
    features: {
      fileWatching: true,
      terminalPty: true,
      processManagement: true,
      gitIntegration: true,
      sqliteJournal: true,
      reverseTunnel: true,
    },
    limits: {
      maxOpenFiles: 100,
      maxFileSizeMb: 25,
      maxTerminals: 5,
      allowedPaths: allowedPaths.length > 0 ? allowedPaths : [process.cwd()],
      deniedPaths: ["/etc", "/var", "/sys", "/proc", "/Windows", "/System"],
    },
  };
}
