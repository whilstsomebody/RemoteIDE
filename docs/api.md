# RemoteIDE REST API Reference

The RemoteIDE API Gateway exposes a RESTful HTTP API on port 3001 (or via reverse proxy on `/api/v1`). All JSON responses follow the standardized envelope schema:

```json
{
  "success": true,
  "data": { ... },
  "error": null
}
```

Or on error:

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required",
    "details": null
  }
}
```

---

## Table of Contents
1. [Authentication & MFA](#1-authentication--mfa)
2. [Workspaces](#2-workspaces)
3. [File System Operations](#3-file-system-operations)
4. [Terminal & Processes](#4-terminal--processes)
5. [Git Integration](#5-git-integration)
6. [Port Forwarding & Previews](#6-port-forwarding--previews)
7. [Temporary Share Links](#7-temporary-share-links)
8. [Cross-Device Handoff & Catch-Up](#8-cross-device-handoff--catch-up)
9. [Gemini AI Assistant](#9-gemini-ai-assistant)
10. [Health & Metrics](#10-health--metrics)

---

## 1. Authentication & MFA

### `POST /api/v1/auth/bootstrap`
Exchange the initial server bootstrap token for the primary Owner session credentials.
- **Request Body**: `{ "setupToken": "setup_sec_..." }`
- **Response**: `{ "token": "jwt_...", "user": { "id": "...", "role": "owner" } }`

### `POST /api/v1/auth/login`
Authenticate with username and password.
- **Request Body**: `{ "email": "user@example.com", "password": "SecretPassword123!" }`
- **Response**: `{ "token": "jwt_...", "mfaRequired": false }`

### `POST /api/v1/auth/mfa/setup`
Generate a new TOTP secret for the authenticated user.
- **Headers**: `Authorization: Bearer <token>`
- **Response**:
  ```json
  {
    "secret": "JBSWY3DPEHPK3PXP...",
    "otpAuthUrl": "otpauth://totp/RemoteIDE:user@example.com?secret=...",
    "backupCodes": ["1a2b3c4d", "5e6f7g8h", ...]
  }
  ```

### `POST /api/v1/auth/mfa/verify`
Verify and enable MFA with a TOTP 6-digit code.
- **Request Body**: `{ "code": "123456" }`
- **Response**: `{ "enabled": true }`

### `POST /api/v1/auth/mfa/authenticate`
Complete authentication when `mfaRequired: true`.
- **Request Body**: `{ "userId": "...", "code": "123456" }` or `{ "userId": "...", "backupCode": "1a2b3c4d" }`
- **Response**: `{ "token": "jwt_...", "user": { ... } }`

---

## 2. Workspaces

### `GET /api/v1/workspaces`
List workspaces accessible to the authenticated caller.
- **Response**: `[ { "id": "ws-1", "name": "RemoteIDE", "hostId": "host-1", "path": "/path/to/repo" } ]`

### `POST /api/v1/workspaces`
Register a new workspace on a connected host.
- **Request Body**: `{ "name": "Project A", "hostId": "host-1", "rootPath": "/home/user/project-a" }`
- **Response**: Workspace entity.

---

## 3. File System Operations

All file operations route over the authenticated reverse tunnel to the host agent. Paths must be relative to the workspace root.

### `GET /api/v1/workspaces/:id/files`
List directory entries with metadata.
- **Query Params**: `path=src&recursive=false`
- **Response**: `[ { "name": "index.ts", "path": "src/index.ts", "type": "file", "size": 1024, "mtime": 1700000000 } ]`

### `GET /api/v1/workspaces/:id/files/content`
Read text or binary file contents.
- **Query Params**: `path=src/index.ts`
- **Response**: `{ "content": "console.log('hi');\n", "encoding": "utf-8", "hash": "sha256_..." }`

### `PUT /api/v1/workspaces/:id/files/content`
Write or update file contents atomically.
- **Request Body**: `{ "path": "src/index.ts", "content": "console.log('updated');", "expectedHash": "..." }`
- **Response**: `{ "bytesWritten": 24, "revision": 42 }`

---

## 4. Terminal & Processes

Interactive terminal sessions run through WebSockets at `/ws/terminal?workspaceId=:id`. REST endpoints provide process execution control:

### `POST /api/v1/workspaces/:id/exec`
Execute a non-interactive shell command.
- **Required Capability**: `TERMINAL_EXEC` (Developer, Operator, Owner)
- **Request Body**: `{ "command": "pnpm test", "args": ["--run"], "cwd": "apps/gateway" }`
- **Response**: `{ "exitCode": 0, "stdout": "...", "stderr": "" }`

---

## 5. Git Integration

### `GET /api/v1/workspaces/:id/git/status`
Retrieve current branch, staged, unstaged, and untracked files.
- **Response**: `{ "branch": "main", "clean": false, "staged": [...], "unstaged": [...] }`

### `POST /api/v1/workspaces/:id/git/commit`
Create a git commit.
- **Request Body**: `{ "message": "feat: add rate limiting", "stageAll": true }`
- **Response**: `{ "commitHash": "a1b2c3d...", "author": "..." }`

---

## 6. Port Forwarding & Previews

### `POST /api/v1/workspaces/:id/ports`
Expose a local port on the host machine through the preview proxy.
- **Request Body**: `{ "port": 3000, "protocol": "http" }`
- **SSRF Restrictions**: System ports (<1024), database ports (5432, 6379, 9092), and metadata IPs (169.254.169.254) are rejected.
- **Response**: `{ "previewUrl": "https://ide.yourdomain.com/preview/ws-1/3000/" }`

---

## 7. Temporary Share Links

### `POST /api/v1/share-links`
Generate an encrypted, time-limited, role-restricted share token.
- **Request Body**:
  ```json
  {
    "workspaceId": "ws-1",
    "role": "viewer",
    "expiresInSeconds": 86400,
    "maxUses": 5,
    "pin": "1234"
  }
  ```
- **Response**:
  ```json
  {
    "rawToken": "sh_live_01928374...",
    "shareLink": { "id": "lnk-1", "expiresAt": "...", "role": "viewer" }
  }
  ```
*Note: The raw token is returned only once at creation time; only its cryptographic hash is stored in the database.*

---

## 8. Cross-Device Handoff & Catch-Up

### `POST /api/v1/handoff/state`
Persist client UI state (open tabs, cursor position, active pane) for cross-device resume.
- **Request Body**: `{ "workspaceId": "ws-1", "activeFile": "index.ts", "cursor": { "line": 10, "col": 5 } }`

### `GET /api/v1/catchup/summary`
Retrieve a net-diff changelog of revisions missed while disconnected.
- **Query Params**: `workspaceId=ws-1&deviceId=phone-b`
- **Response**:
  ```json
  {
    "deliveryId": "del_019...",
    "fromRevision": 12,
    "toRevision": 18,
    "netChanges": {
      "filesModified": ["index.js"]
    }
  }
  ```

### `POST /api/v1/catchup/ack`
Acknowledge receipt and advance the device's changelog cursor monotonically.
- **Request Body**: `{ "deliveryId": "del_019...", "workspaceId": "ws-1", "deviceId": "phone-b" }`

---

## 9. Gemini AI Assistant

*Assistant is strictly read-only.*

### `POST /api/v1/ai/conversations`
Start a new Q&A session.
- **Request Body**: `{ "workspaceId": "ws-1", "title": "Performance Optimization" }`
- **Response**: `{ "id": "conv-1", "title": "Performance Optimization" }`

### `POST /api/v1/ai/conversations/:id/stream`
Send a question and stream Gemini's response over Server-Sent Events (SSE).
- **Request Body**: `{ "prompt": "Explain this stack trace: ...", "attachments": [...] }`
- **Streaming Response**: `data: {"chunk": "This error occurs because..."}\n\n`

---

## 10. Health & Metrics

### `GET /health`
Liveness check returning basic service uptime.
- **Response**: `{ "status": "healthy", "uptime": 123.45, "timestamp": "..." }`

### `GET /health/readiness`
Deep dependency readiness check (PostgreSQL, Redis, Kafka). Returns `200` if operational, `503` if degraded.

### `GET /metrics`
Prometheus metrics format containing latency histograms (p50, p90, p95, p99), WebSocket connections, and error counters.

### `GET /api/v1/metrics`
JSON representation of service metrics.
