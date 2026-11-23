# RemoteIDE Security Architecture, Threat Model, and Hardening Guide

RemoteIDE is designed to run in untrusted network environments, connecting developer machines to remote browsers. This document details the threat model, STRIDE security analysis, defensive controls, and operational hardening guidelines.

---

## 1. Threat Model & Trust Boundaries

```
[ Remote Browsers / Mobile PWA ] (Untrusted)
              │
══════════════╪═════════════════════════════════════════════════ Ingress Boundary
              ▼
    [ Caddy TLS Proxy ]
              │
    [ Fastify API Gateway ] (Enforces Auth, RBAC, Rate Limits, SSRF Guards)
              │
══════════════╪═════════════════════════════════════════════════ Relay Boundary
              ▼
    [ Outbound WSS Tunnel ] (Host Initiated, TLS Mutual Token Auth)
              │
══════════════╪═════════════════════════════════════════════════ Host Boundary
              ▼
   [ Host Agent / PTY / Local FS ] (Executes as Local Developer User)
```

### Trust Assumptions:
1. **Clients are untrusted**: Mobile devices, browsers, and temporary share link holders can be malicious or compromised.
2. **Control Plane is semi-trusted**: The gateway authenticates users and relays commands, but should never store developer credentials or unencrypted workspace secrets.
3. **Host Agent is authoritative**: The developer's machine decides whether commands are valid and isolates filesystem actions to the registered workspace root.

---

## 2. STRIDE Analysis & Defensive Controls

| STRIDE Threat | Attack Vector | RemoteIDE Defense |
|---|---|---|
| **Spoofing** | Stolen credentials, fake agent registration, session hijacking | TOTP Multi-Factor Authentication, cryptographic setup tokens, SHA-256 session token hashing, IP and user-agent binding. |
| **Tampering** | In-transit modification of commands or files | Mandatory TLS 1.3 across all HTTP and WebSocket connections; frame sequence validation. |
| **Repudiation** | Denying an unauthorized file edit or terminal command | Append-only immutable Kafka audit log topic (`remoteide.audit.events`) recording actor, timestamp, IP, and payload hash. |
| **Information Disclosure** | Path traversal, symlink escape, secret exfiltration, SSRF | Symlink canonicalization with `fs.realpathSync`; link-local/cloud metadata IP blocking (`169.254.169.254`); internal database port blocking (5432, 6379, 9092). |
| **Denial of Service** | WS frame flooding, brute-force login, runaway commands | Sliding-window IP and token rate limiting; circuit breakers on tunnel relay; PTY resource quotas; heartbeat dead-connection reaping. |
| **Elevation of Privilege** | Read-only viewer executing commands or injecting CRDT edits | Role-based capability enforcement (`ROLE_PERMISSIONS`); server-side validation rejecting Yjs update frames from Viewer sessions; non-delegation of Owner role in share links. |

---

## 3. Server-Side Request Forgery (SSRF) Prevention

RemoteIDE provides port forwarding and web preview capabilities. To prevent attackers from pivoting through the agent or gateway to internal infrastructure:

1. **Blocked Cloud Metadata Addresses**:
   - `169.254.169.254` (AWS, GCP, Azure, OpenStack instance metadata)
   - `metadata.google.internal`
   - `100.100.100.200` (Alibaba Cloud metadata)
2. **Blocked Infrastructure Ports**:
   - `5432` (PostgreSQL)
   - `6379` (Redis)
   - `9092` (Kafka)
   - `2375`, `2376` (Docker daemon)
3. **Private Network Verification**:
   - Outbound preview proxy requests validate DNS resolution and deny connections to non-whitelisted internal subnets.

---

## 4. Multi-Factor Authentication (TOTP RFC 6238)

- Implemented with zero external npm dependencies using native `node:crypto`.
- HMAC-SHA1 30-second time-step algorithm with drift window tolerance (±1 step).
- **Cryptographic Backup Codes**: 8-character single-use recovery codes generated via `crypto.randomBytes(4).toString('hex')`. Stored strictly as SHA-256 hashes and consumed atomically upon use.

---

## 5. Filesystem Jail & Symlink Traversal Protection

Every file operation invokes `validateWorkspacePath(workspaceRoot, requestedPath)`:

```typescript
export function validateWorkspacePath(workspaceRoot: string, requestedPath: string): string {
  const safeRoot = path.resolve(workspaceRoot);
  const target = path.resolve(safeRoot, requestedPath);

  // Assert target starts with workspace root
  if (!target.startsWith(safeRoot + path.sep) && target !== safeRoot) {
    throw new AppError(ErrorCode.FORBIDDEN, "Directory traversal detected");
  }

  // Canonicalize symlinks if file exists
  if (fs.existsSync(target)) {
    const real = fs.realpathSync(target);
    if (!real.startsWith(safeRoot + path.sep) && real !== safeRoot) {
      throw new AppError(ErrorCode.FORBIDDEN, "Symlink escape detected");
    }
    return real;
  }

  return target;
}
```

---

## 6. Content Security Policy & Security Headers

Caddy and Fastify inject strict security headers:
- `Content-Security-Policy`: Restricts scripts, workers, and styles to self and trusted domains.
- `X-Frame-Options`: `DENY`
- `X-Content-Type-Options`: `nosniff`
- `Strict-Transport-Security`: `max-age=63072000; includeSubDomains; preload`
- `Cross-Origin-Opener-Policy`: `same-origin`
- `Cross-Origin-Embedder-Policy`: `credentialless`
