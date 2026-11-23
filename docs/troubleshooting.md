# RemoteIDE Troubleshooting & Operations Guide

This guide covers diagnostic procedures, common error scenarios, and recovery steps for the RemoteIDE distributed environment.

---

## 1. Quick Diagnostic Checklist

```bash
# 1. Check Gateway Liveness and Readiness
curl -s http://localhost:3001/health | jq .
curl -s http://localhost:3001/health/readiness | jq .

# 2. Check Host Agent Status
remoteide-agent status
remoteide-agent health

# 3. Check Real-Time Metrics & Latency
curl -s http://localhost:3001/metrics | grep remoteide_http_requests
```

---

## 2. Common Issues & Solutions

### A. "Host Agent is Offline (503 Service Unavailable)"
- **Symptoms**: Browser shows "Disconnected from Host", terminal is unresponsive, file tree does not load.
- **Cause**: The reverse tunnel between the host machine and the gateway is broken or blocked.
- **Remediation**:
  1. Verify the agent process is running on the workstation:
     ```bash
     remoteide-agent status
     ```
  2. Inspect the agent logs for authentication or network errors:
     ```bash
     remoteide-agent logs -n 50
     ```
  3. Ensure the gateway URL specified in `~/.remoteide/agent.json` matches the server endpoint.
  4. If running behind a corporate proxy, set `HTTPS_PROXY` environment variable before starting the agent.

### B. "Symlink Escape Detected (403 Forbidden)"
- **Symptoms**: Cannot open or save a file linked outside the repository root.
- **Cause**: RemoteIDE security jailing prevents resolving symlinks pointing outside the designated workspace root.
- **Remediation**:
  - Keep all dependencies and source files within the workspace root.
  - Alternatively, launch a separate workspace instance rooted at the parent folder containing both directories.

### C. "Circuit Breaker OPEN for Tunnel Relay"
- **Symptoms**: RPC requests fail immediately with `CircuitBreaker: Tunnel relay is temporarily open`.
- **Cause**: The host agent failed to respond to 5 consecutive RPC calls within the timeout window (10 seconds each).
- **Remediation**:
  - The circuit breaker enters `HALF_OPEN` state after 30 seconds and automatically tests recovery with a probe request.
  - Check whether the host workstation is under heavy CPU/memory load (e.g. large build or compilation process).

### D. "SSRF Target Blocked (400 / 403)"
- **Symptoms**: Cannot forward port 5432 or navigate to `http://169.254.169.254`.
- **Cause**: Anti-SSRF policies prevent access to database ports, cloud metadata IPs, and container management interfaces.
- **Remediation**:
  - Only forward application listening ports (e.g. 3000, 8080, 5173). Database administration should be conducted through secure administrative tunnels.

---

## 3. Application Error Codes Reference

| Error Code | HTTP Status | Description | Action Required |
|---|---|---|---|
| `UNAUTHORIZED` | 401 | Missing, invalid, or expired session token | Re-authenticate or refresh token |
| `MFA_REQUIRED` | 403 | Account requires TOTP or backup code verification | Complete MFA verification step |
| `FORBIDDEN` | 403 | Caller role lacks permission for the action | Request role upgrade from Owner |
| `NOT_FOUND` | 404 | Workspace, file, or session does not exist | Verify resource identifiers |
| `RATE_LIMITED` | 429 | Exceeded requests per minute quota | Exponential backoff before retry |
| `HOST_OFFLINE` | 503 | Host agent reverse tunnel is disconnected | Restart `remoteide-agent` on host |
| `CIRCUIT_OPEN` | 503 | RPC relay failed consecutive calls | Wait 30 seconds for self-healing |
| `SSRF_DETECTED`| 400 | Target IP or port is blocked by security filter | Choose a valid application port |
