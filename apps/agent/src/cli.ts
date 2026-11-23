#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync, execSync, spawn } from "node:child_process";

const CONFIG_DIR = path.join(os.homedir(), ".remoteide");
const LOG_DIR = path.join(CONFIG_DIR, "logs");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
const PID_FILE = path.join(CONFIG_DIR, "agent.pid");
const LOG_FILE = path.join(LOG_DIR, "agent.log");

function ensureDirs() {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch {}
}

function getPlatform(): "darwin" | "linux" | "unsupported" {
  const p = os.platform();
  if (p === "darwin") return "darwin";
  if (p === "linux") return "linux";
  return "unsupported";
}

const LAUNCHD_PLIST = path.join(os.homedir(), "Library/LaunchAgents/com.remoteide.agent.plist");
const SYSTEMD_USER_DIR = path.join(os.homedir(), ".config/systemd/user");
const SYSTEMD_SERVICE = path.join(SYSTEMD_USER_DIR, "remoteide-agent.service");

function getAgentScriptPath(): string {
  // ESM has no __dirname; derive the package root from this module's URL.
  const currentDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const distServer = path.join(currentDir, "dist/server.js");
  if (fs.existsSync(distServer)) return distServer;
  const srcServer = path.join(currentDir, "src/server.ts");
  if (fs.existsSync(srcServer)) return srcServer;
  return distServer;
}

function getNodePath(): string {
  try {
    return execSync("which node", { encoding: "utf-8" }).trim();
  } catch {
    return process.execPath;
  }
}

export async function runCli(args: string[]): Promise<void> {
  const cmd = args[0] || "help";
  if (cmd !== "help") {
    ensureDirs();
  }

  const platform = getPlatform();

  switch (cmd) {
    case "install": {
      console.log(`[RemoteIDE] Packaging and installing host agent service for ${os.platform()} (${os.arch()})...`);
      const nodePath = getNodePath();
      const serverPath = getAgentScriptPath();

      if (platform === "darwin") {
        fs.mkdirSync(path.dirname(LAUNCHD_PLIST), { recursive: true });
        const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.remoteide.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>${nodePath}</string>
        <string>${serverPath}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${LOG_FILE}</string>
    <key>StandardErrorPath</key>
    <string>${LOG_FILE}</string>
    <key>WorkingDirectory</key>
    <string>${path.dirname(serverPath)}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>NODE_ENV</key>
        <string>production</string>
        <key>PORT</key>
        <string>4001</string>
    </dict>
</dict>
</plist>`;
        fs.writeFileSync(LAUNCHD_PLIST, plistContent);
        console.log(`[RemoteIDE] Wrote launchd plist to ${LAUNCHD_PLIST}`);
        try {
          try {
            execFileSync("launchctl", ["unload", LAUNCHD_PLIST], { stdio: "ignore" });
          } catch {
            // Not loaded yet.
          }
          execFileSync("launchctl", ["load", LAUNCHD_PLIST]);
          console.log("[RemoteIDE] Service registered and loaded with launchd.");
        } catch (e: any) {
          console.warn("[RemoteIDE] Could not auto-load with launchctl:", e.message);
        }
      } else if (platform === "linux") {
        fs.mkdirSync(SYSTEMD_USER_DIR, { recursive: true });
        const unitContent = `[Unit]
Description=RemoteIDE Host Agent Daemon
After=network.target

[Service]
Type=simple
ExecStart=${nodePath} ${serverPath}
Restart=always
RestartSec=5
StandardOutput=append:${LOG_FILE}
StandardError=append:${LOG_FILE}
WorkingDirectory=${path.dirname(serverPath)}
Environment=NODE_ENV=production
Environment=PORT=4001

[Install]
WantedBy=default.target
`;
        fs.writeFileSync(SYSTEMD_SERVICE, unitContent);
        console.log(`[RemoteIDE] Wrote systemd unit to ${SYSTEMD_SERVICE}`);
        try {
          execSync("systemctl --user daemon-reload");
          execSync("systemctl --user enable remoteide-agent.service");
          console.log("[RemoteIDE] Service registered and enabled with systemd user daemon.");
        } catch (e: any) {
          console.warn("[RemoteIDE] systemctl notice:", e.message);
        }
      } else {
        console.warn(`[RemoteIDE] Warning: ${os.platform()} is not natively supported as a service daemon.`);
        console.log("[RemoteIDE] You can still run the agent directly using: node dist/server.js");
      }
      break;
    }

    case "start": {
      console.log("[RemoteIDE] Starting host agent service...");
      if (platform === "darwin" && fs.existsSync(LAUNCHD_PLIST)) {
        try {
          execSync(`launchctl start com.remoteide.agent`);
          console.log("[RemoteIDE] Service start requested via launchctl.");
        } catch (e: any) {
          console.error("Start failed:", e.message);
        }
      } else if (platform === "linux" && fs.existsSync(SYSTEMD_SERVICE)) {
        try {
          execSync("systemctl --user start remoteide-agent.service");
          console.log("[RemoteIDE] Service started via systemctl.");
        } catch (e: any) {
          console.error("Start failed:", e.message);
        }
      } else {
        const nodePath = getNodePath();
        const serverPath = getAgentScriptPath();
        const out = fs.openSync(LOG_FILE, "a");
        const child = spawn(nodePath, [serverPath], {
          detached: true,
          stdio: ["ignore", out, out],
          cwd: path.dirname(serverPath),
          env: { ...process.env, PORT: "4001" },
        });
        child.unref();
        if (child.pid) {
          fs.writeFileSync(PID_FILE, String(child.pid));
          console.log(`[RemoteIDE] Spawned background agent (PID: ${child.pid}). Logs: ${LOG_FILE}`);
        }
      }
      break;
    }

    case "stop": {
      console.log("[RemoteIDE] Stopping host agent service...");
      if (platform === "darwin" && fs.existsSync(LAUNCHD_PLIST)) {
        try {
          execSync(`launchctl stop com.remoteide.agent`);
          console.log("[RemoteIDE] Service stopped via launchctl.");
        } catch (e: any) {
          console.error("Stop failed:", e.message);
        }
      } else if (platform === "linux" && fs.existsSync(SYSTEMD_SERVICE)) {
        try {
          execSync("systemctl --user stop remoteide-agent.service");
          console.log("[RemoteIDE] Service stopped via systemctl.");
        } catch (e: any) {
          console.error("Stop failed:", e.message);
        }
      }

      if (fs.existsSync(PID_FILE)) {
        try {
          const pid = parseInt(fs.readFileSync(PID_FILE, "utf-8").trim(), 10);
          process.kill(pid, "SIGTERM");
          console.log(`[RemoteIDE] Terminated process PID ${pid}.`);
        } catch {}
        fs.rmSync(PID_FILE, { force: true });
      }
      break;
    }

    case "restart": {
      await runCli(["stop"]);
      await new Promise((r) => setTimeout(r, 1000));
      await runCli(["start"]);
      break;
    }

    case "status":
    case "health": {
      console.log("[RemoteIDE] Probing host agent status...");
      try {
        const res = await fetch("http://127.0.0.1:4001/api/v1/health");
        if (res.ok) {
          const data = (await res.json()) as any;
          console.log("[RemoteIDE] Host Agent is ONLINE and HEALTHY:");
          console.log(JSON.stringify(data.data || data, null, 2));
        } else {
          console.error(`[RemoteIDE] Host Agent returned HTTP ${res.status}`);
        }
      } catch (e: any) {
        console.error("[RemoteIDE] Host Agent is OFFLINE or unreachable on http://127.0.0.1:4001:", e.message);
      }
      break;
    }

    case "logs": {
      if (!fs.existsSync(LOG_FILE)) {
        console.log(`[RemoteIDE] No log file found at ${LOG_FILE}`);
        return;
      }
      console.log(`[RemoteIDE] Streaming logs from ${LOG_FILE}...`);
      const tail = spawn("tail", ["-f", "-n", "50", LOG_FILE], { stdio: "inherit" });
      process.on("SIGINT", () => {
        tail.kill();
        process.exit(0);
      });
      break;
    }

    case "config": {
      if (!fs.existsSync(CONFIG_FILE)) {
        const defaultConfig = {
          port: 4001,
          gatewayWsUrl: "ws://127.0.0.1:4000/api/v1/tunnel",
          allowedRoots: [os.homedir()],
        };
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
      }
      console.log(`[RemoteIDE] Configuration at ${CONFIG_FILE}:`);
      console.log(fs.readFileSync(CONFIG_FILE, "utf-8"));
      break;
    }

    case "uninstall": {
      console.log("[RemoteIDE] Uninstalling background service...");
      if (platform === "darwin" && fs.existsSync(LAUNCHD_PLIST)) {
        try {
          try {
            execFileSync("launchctl", ["unload", LAUNCHD_PLIST], { stdio: "ignore" });
          } catch {
            // Not loaded.
          }
          fs.rmSync(LAUNCHD_PLIST, { force: true });
          console.log("[RemoteIDE] Removed launchd plist.");
        } catch {}
      } else if (platform === "linux" && fs.existsSync(SYSTEMD_SERVICE)) {
        try {
          execSync("systemctl --user stop remoteide-agent.service 2>/dev/null || true");
          execSync("systemctl --user disable remoteide-agent.service 2>/dev/null || true");
          fs.rmSync(SYSTEMD_SERVICE, { force: true });
          execSync("systemctl --user daemon-reload 2>/dev/null || true");
          console.log("[RemoteIDE] Removed systemd service.");
        } catch {}
      }
      console.log("[RemoteIDE] Host agent service uninstalled. Project files preserved.");
      break;
    }

    case "help":
    default: {
      console.log(`
RemoteIDE Host Agent CLI

Usage:
  remoteide-agent <command>

Commands:
  install     Register agent with macOS launchd or Linux systemd
  start       Start background service
  stop        Stop background service
  restart     Restart background service
  status      Check agent status and reachability
  health      Run detailed diagnostic health checks
  logs        Stream real-time log output
  uninstall   Unregister service daemon

Platform:
  Supported: macOS (launchd), Linux (systemd)
  Other OSes: Run manually via \`node dist/server.js\`
      `);
      break;
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void runCli(process.argv.slice(2));
}
