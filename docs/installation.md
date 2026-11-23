# RemoteIDE Installation Guide

This guide details how to install and configure all components of RemoteIDE for production and development environments: the **Host Agent**, the **API Gateway**, the **Web Frontend**, and background **Workers**.

---

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Host Agent Installation (macOS & Linux)](#host-agent-installation-macos--linux)
   - [Automated CLI Setup](#automated-cli-setup)
   - [macOS Background Service (launchd)](#macos-background-service-launchd)
   - [Linux Background Service (systemd)](#linux-background-service-systemd)
   - [Manual Execution](#manual-execution)
3. [Control Plane Installation](#control-plane-installation)
   - [API Gateway](#api-gateway)
   - [Web Frontend (PWA)](#web-frontend-pwa)
   - [Worker Service](#worker-service)
4. [Verification and Health Checks](#verification-and-health-checks)

---

## 1. Prerequisites

### Host Machine (macOS or Linux)
- Node.js >= 20.0.0
- Git >= 2.30.0
- Recommended: Docker (for containerized workspace execution)

### Server Infrastructure (Control Plane)
- Docker & Docker Compose v2+
- PostgreSQL 16+
- Redis 7+
- Apache Kafka 3.6+ / Redpanda
- Caddy or Nginx (for TLS termination)

---

## 2. Host Agent Installation (macOS & Linux)

The RemoteIDE Host Agent (`remoteide-agent`) runs locally on your development machine, establishing a secure outbound reverse tunnel to your Gateway. It requires no inbound open firewall ports.

### Automated CLI Setup

The agent CLI is packaged in `apps/agent` and includes automated daemon service management for macOS `launchd` and Linux `systemd`.

```bash
# From the repository root, build the agent package
pnpm --filter @remote-ide/agent build

# Link the CLI globally (or run from bin/remoteide-agent.js)
pnpm --filter @remote-ide/agent link --global
```

Verify the binary is available:
```bash
remoteide-agent help
```

### Configuration File
By default, the agent reads configuration from `~/.remoteide/agent.json` or environment variables:

```json
{
  "hostId": "host-macbook-pro",
  "gatewayUrl": "wss://ide.yourdomain.com/ws/tunnel",
  "authToken": "agt_sec_0192837465abcdef...",
  "workspaceRoot": "/Users/username/Projects",
  "logLevel": "info"
}
```

Or configure via CLI:
```bash
remoteide-agent config --host-id my-workstation --gateway wss://ide.yourdomain.com/ws/tunnel --token agt_sec_...
```

### macOS Background Service (launchd)

Install the user LaunchAgent plist:
```bash
# Installs to ~/Library/LaunchAgents/com.remoteide.agent.plist and loads it
remoteide-agent install

# Check status
remoteide-agent status

# Stop, start, or restart
remoteide-agent stop
remoteide-agent start
remoteide-agent restart

# View streaming logs
remoteide-agent logs -f

# Uninstall the LaunchAgent
remoteide-agent uninstall
```

The LaunchAgent plist is configured with `KeepAlive: true`, `RunAtLoad: true`, and automatically restarts upon system boot or agent crash.

### Linux Background Service (systemd)

On Linux distributions (Ubuntu, Debian, Fedora, Arch, CentOS), `remoteide-agent install` automatically detects `systemd` and configures a lingering user unit:

```bash
# Installs to ~/.config/systemd/user/remoteide-agent.service and enables it
remoteide-agent install

# Enable user lingering so the daemon runs even when not logged into a GUI session
loginctl enable-linger $USER

# Service management commands
remoteide-agent status
remoteide-agent restart
remoteide-agent logs
```

### Manual Execution

To run the agent interactively in your foreground shell:
```bash
export GATEWAY_URL="wss://ide.yourdomain.com/ws/tunnel"
export AGENT_TOKEN="agt_sec_..."
export WORKSPACE_ROOT="/path/to/workspaces"

remoteide-agent
```

---

## 3. Control Plane Installation

For production deployments, the Gateway, Web frontend, and Worker run in Docker containers managed by Docker Compose and reverse-proxied through Caddy.

### Quick Production Deployment

```bash
cd infra
cp .env.example .env
# Edit .env with secure random tokens and passwords
docker compose -f docker-compose.prod.yml up -d
```

### Environment Variables

| Variable | Description | Default |
|---|---|---|
| `NODE_ENV` | Runtime environment (`production` / `development`) | `production` |
| `PORT` | Gateway HTTP/WS listening port | `3001` |
| `DATABASE_URL` | PostgreSQL connection string | `postgres://remoteide:...@postgres:5432/remoteide` |
| `REDIS_URL` | Redis connection string | `redis://redis:6379` |
| `KAFKA_BROKERS` | Comma-separated list of Kafka broker endpoints | `kafka:9092` |
| `SETUP_TOKEN` | Initial bootstrap administrative token | (randomly generated if unset) |
| `JWT_SECRET` | Secret key for signing session tokens | (random 32-byte hex) |

---

## 4. Verification and Health Checks

Verify your installation by invoking the health and readiness endpoints:

```bash
# Gateway Health
curl https://ide.yourdomain.com/health
# Response: {"status":"healthy","uptime":3600,"timestamp":"..."}

# Gateway Readiness (checks DB, Redis, Kafka connections)
curl https://ide.yourdomain.com/health/readiness

# Host Agent Health
remoteide-agent health
# or curl local probe
curl http://127.0.0.1:3002/health
```
