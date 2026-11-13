# Phase 3: Remote Connectivity, Authentication, and Access Sharing — Manual Testing Guide

This guide provides end-to-end instructions for testing and validating the Phase 3 remote connectivity, owner authentication, temporary share link redemption, dual-layer capability authorization, and security audit log capabilities of RemoteIDE.

---

## Architecture Overview

```
                      ┌─────────────────────────────────────────┐
                      │             Remote Gateway              │
                      │        (Public Relay or Cloud)          │
                      │  - WebSocket Reverse Tunnel Registry    │
                      │  - Rate-Limited Auth & Session Store    │
                      │  - Share Link Hashing (SHA-256)         │
                      │  - Gateway-Level Capability Guard       │
                      └──────────────┬───────────────────▲──────┘
                                     │                   │
               Outbound Reverse WS   │                   │ Authenticated HTTPS / WS
               (No inbound ports)    │                   │ (Session cookie or token)
                                     ▼                   │
    ┌───────────────────────────────────┐    ┌───────────┴────────────────────────┐
    │          Local Host Agent         │    │           Client Browser           │
    │  - Initiates outbound connection  │    │  - Next.js Web IDE / Share Portal  │
    │  - Dual-layer capability check    │    │  - Session & Sharing Dashboard     │
    │  - Strict Owner-only Terminal     │    │  - Real-time QR Code Generator     │
    │  - Local loopback bootstrap       │    └────────────────────────────────────┘
    └───────────────────────────────────┘
```

---

## 1. Prerequisites and Setup

1. **Install dependencies and build packages**:

   ```bash
   pnpm install
   pnpm build
   ```

2. **Run Gateway (Relay & Auth Server)**:

   ```bash
   pnpm --filter @remote-ide/gateway dev
   # Starts at http://localhost:4000 (ws://localhost:4000)
   ```

3. **Run Host Agent (Runs locally on host machine)**:

   ```bash
   pnpm --filter @remote-ide/agent dev
   # Starts at http://127.0.0.1:4001, opens outbound reverse tunnel to ws://localhost:4000/api/v1/tunnel/agent
   ```

4. **Run Web Interface**:
   ```bash
   pnpm --filter @remote-ide/web dev
   # Starts at http://localhost:3000
   ```

---

## 2. Remote Connectivity & Reverse Tunnel Verification

### Verification Goal: Zero Inbound Port Forwarding

The host agent connects _outward_ to the gateway over a persistent WebSocket with automatic reconnect, ping/pong heartbeats, and exponential backoff.

1. **Check Gateway Tunnel Status**:

   ```bash
   curl http://localhost:4000/api/v1/tunnel/status
   ```

   **Expected Response**:

   ```json
   {
     "success": true,
     "data": {
       "online": true,
       "connectedAt": "...",
       "lastHeartbeatAt": "..."
     }
   }
   ```

2. **Simulate Host Disconnect & Auto-Recovery**:
   - Terminate the host agent (`Ctrl+C`).
   - Query `/api/v1/tunnel/status` — response shows `"online": false`.
   - Restart the host agent. Within 1-2 seconds, the tunnel re-establishes without restarting the gateway.

---

## 3. Trusted Local Owner Bootstrap

To guarantee security, owner account creation is strictly restricted to trusted local loopback (`127.0.0.1` / `::1`). External or remote requests to bootstrap are immediately rejected.

1. **Attempt bootstrap via external/spoofed origin**:

   ```bash
   curl -X POST http://localhost:4000/api/v1/auth/bootstrap \
     -H "Content-Type: application/json" \
     -H "X-Forwarded-For: 203.0.113.195" \
     -d '{"email": "owner@remoteide.local", "password": "SecurePassword123!"}'
   ```

   **Expected**: `403 Forbidden` (`FORBIDDEN: Owner bootstrap is only permitted from the local host loopback interface`).

2. **Perform legitimate local loopback bootstrap**:

   ```bash
   curl -X POST http://127.0.0.1:4000/api/v1/auth/bootstrap \
     -H "Content-Type: application/json" \
     -d '{"email": "owner@remoteide.local", "password": "SecurePassword123!", "deviceName": "Aman MacBook Pro"}'
   ```

   **Expected**: `201 Created` with a new owner session and session token cookie.

3. **Verify single-owner bootstrapping**:
   - Repeat the request.
   - **Expected**: `409 Conflict` (`CONFLICT: Owner account has already been bootstrapped`).

---

## 4. Owner Authentication & Rate Limiting

1. **Successful Login**:

   ```bash
   curl -X POST http://localhost:4000/api/v1/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email": "owner@remoteide.local", "password": "SecurePassword123!", "deviceName": "Workstation Browser"}'
   ```

   **Expected**: `200 OK` returning `token`, `role: "owner"`, and `capabilities` (including `TERMINAL_ACCESS`).

2. **Brute-Force Rate Limiting**:
   - Submit 5 consecutive incorrect passwords:
     ```bash
     for i in {1..5}; do
       curl -s -X POST http://localhost:4000/api/v1/auth/login \
         -H "Content-Type: application/json" \
         -d '{"email": "owner@remoteide.local", "password": "WrongPassword!"}' | grep error
     done
     ```
   - Attempt a 6th request:
     **Expected**: `429 Too Many Requests` (`TOO_MANY_REQUESTS: Too many failed login attempts. Account temporarily locked for 5 minutes.`).

---

## 5. Temporary Share Links & Capability Authorization

Share links allow the owner to invite collaborators without sharing credentials or opening ports.

### A. Creating a Share Link

1. Click the **Share** button (`Share2` icon in the IDE header) or send a POST request:
   ```bash
   curl -X POST http://localhost:4000/api/v1/share-links \
     -H "Authorization: Bearer <OWNER_TOKEN>" \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Design Review Access",
       "role": "viewer",
       "expiresInSeconds": 1800,
       "pin": "4829",
       "oneTimeRedemption": true
     }'
   ```
2. **Key Security Attributes**:
   - Only the SHA-256 hash of the token is stored in the database.
   - Raw tokens are returned once upon creation and never logged.
   - PIN is scrypt-hashed.

### B. Redeeming via Guest Portal (`/share`)

1. Open `http://localhost:3000/share?token=<RAW_TOKEN>` in an Incognito / private browsing window.
2. Enter the PIN `4829` (if configured) and device name `Reviewer iPad`.
3. Click **Connect to Workspace**.
4. The token is exchanged for a short-lived `viewer` session cookie and the user is redirected to the IDE.

### C. Capability Enforcement Matrix

| Action                              |  Viewer  |  Editor  | Developer | Operator | Owner |
| ----------------------------------- | :------: | :------: | :-------: | :------: | :---: |
| Read Files (`GET /files`)           |    ✅    |    ✅    |    ✅     |    ✅    |  ✅   |
| Edit Files (`POST /files/write`)    | ❌ (403) |    ✅    |    ✅     |    ✅    |  ✅   |
| Delete Files (`DELETE /files`)      | ❌ (403) | ❌ (403) |    ✅     |    ✅    |  ✅   |
| Run Git Operations                  | ❌ (403) | ❌ (403) |    ✅     |    ✅    |  ✅   |
| Terminal Access (`TERMINAL_ACCESS`) | ❌ (403) | ❌ (403) | ❌ (403)  | ❌ (403) |  ✅   |

- **Dual-Layer Enforcement**: Both the Gateway proxy and the Host Agent enforce capabilities independently. If a compromised gateway attempts to forward unauthorized file modifications or terminal commands, the Host Agent denies the request.
- **Terminal Isolation**: Host agent strictly blocks non-owner terminal access with `AppError(FORBIDDEN, "Terminal access is restricted to the host owner until OS-level execution isolation is configured.")`.

---

## 6. Real-Time Session Revocation & Instant Disconnect

1. Open the **Security & Sessions** dashboard (`Shield` icon in the IDE header).
2. View active sessions across devices, showing:
   - Device Name & IP address
   - Assigned Role & Permissions
   - Expiration countdown
3. Click **Terminate** on an active guest session.
4. **Instant Severance**:
   - The session token is immediately deleted from the database.
   - All active WebSocket connections associated with that session are severed immediately with code `4401 (Session Terminated)`.
   - Any subsequent HTTP proxy requests return `401 Unauthorized`.

---

## 7. Security Audit Log Inspection

Navigate to the **Audit Log** tab in the Session Dashboard or query:

```bash
curl http://localhost:4000/api/v1/auth/audit -H "Authorization: Bearer <OWNER_TOKEN>"
```

**Recorded Security Events**:

- `OWNER_BOOTSTRAP`
- `LOGIN_SUCCESS` / `LOGIN_FAILURE` / `LOGIN_LOCKED`
- `SHARE_LINK_CREATED` / `SHARE_LINK_REDEEMED` / `SHARE_LINK_REVOKED`
- `SESSION_TERMINATED`
- `SECURITY_VIOLATION` (Capability / permission denial attempts)

_All credentials, passwords, and raw share tokens are automatically redacted in audit logs._

---

## 8. Cloudflare Tunnel Integration (Optional Public Deployment)

To expose the RemoteIDE gateway securely to the internet without router port forwarding:

1. Install `cloudflared`:
   ```bash
   brew install cloudflared
   ```
2. Start quick zero-configuration tunnel:
   ```bash
   cloudflared tunnel --url http://localhost:4000
   ```
3. Cloudflare outputs a public HTTPS URL (e.g. `https://random-words.trycloudflare.com`).
4. Set in your environment:
   ```bash
   NEXT_PUBLIC_GATEWAY_URL="https://random-words.trycloudflare.com"
   ```
5. Host agent connects via `AGENT_GATEWAY_WS_URL="wss://random-words.trycloudflare.com/api/v1/tunnel/agent"`.
6. Access control remains strictly authenticated by RemoteIDE's capability tokens; the tunnel is used purely for transport exposure.
