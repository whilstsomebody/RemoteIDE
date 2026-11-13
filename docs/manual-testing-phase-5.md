# Git, Process Management, Port Forwarding, and API Client — Manual Testing Guide

This guide provides end-to-end instructions for testing and validating RemoteIDE's host-native Git integration, development process manager, local port forwarding and application preview, built-in API client, and dual-layer capability authorization.

---

## Architecture Overview

```
 ┌────────────────────────────────────────────────────────────────────────┐
 │                        Client Browser (Next.js)                        │
 │  - Source Control Panel: branch switch, sync, stage, commit, diff view │
 │  - Process Manager: start, stop, restart, CPU/RAM stats, live logs     │
 │  - Port Forwarding & Responsive App Preview (Desktop / Tablet / Mobile)│
 │  - Built-in HTTP/API Client & WebSocket Tester with cURL export        │
 └───────────────────────────────────▲────────────────────────────────────┘
                                     │ Authenticated HTTPS / WS
                                     ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │                             Remote Gateway                             │
 │  - Capability Guards: git:read, git:write, git:push, git:destructive,   │
 │    port:forward, preview:access, process:control                       │
 │  - Reverse proxy for /api/v1/preview/:port/ with SSRF guards           │
 │  - Multiplexes requests over outbound reverse tunnel                   │
 └───────────────────────────────────▲────────────────────────────────────┘
                                     │ Outbound Reverse WS Tunnel
                                     ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │                            Local Host Agent                            │
 │  - Structured Git CLI execution (execFileAsync, no shell interpolation)│
 │  - Managed Process Registry: PID tracking, CPU/RAM via ps, ring buffer │
 │  - Port Forwarding Registry & Local Proxy (127.0.0.1:port)             │
 │  - API Client Executor with cloud metadata SSRF block (169.254.169.254)│
 │  - Dual-layer capability check: verifies all permissions again         │
 └────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Prerequisites and Setup

1. **Build monorepo packages**:

   ```bash
   pnpm install
   pnpm build
   ```

2. **Start Gateway** (runs on port 4000):

   ```bash
   pnpm --filter @remote-ide/gateway dev
   ```

3. **Start Host Agent** (runs on port 4001, opens outbound reverse tunnel to gateway):

   ```bash
   pnpm --filter @remote-ide/agent dev
   ```

4. **Start Web Interface** (runs on port 3000):
   ```bash
   pnpm --filter @remote-ide/web dev
   ```

---

## 2. Git Integration Verification

### Step 1: Open Source Control Panel

1. In the browser (`http://localhost:3000`), log in as the Owner.
2. In the Activity Bar on the far left, click the **Source Control** icon (branch icon) or switch to the Git tab.
3. Observe:
   - Current active branch name displayed in the header with a **Refresh** button.
   - Incoming/outgoing commit counter and sync action button.
   - Commit message text area with **Commit** button.
   - Collapsible sections: **Staged Changes**, **Changes (Unstaged)**, and **Untracked Files**.

### Step 2: Stage, Unstage, and Diff Inspection

1. Modify a tracked file in the editor (or run `echo "// test" >> apps/agent/src/index.ts`).
2. Create an untracked file (e.g., `touch test-untracked.txt`).
3. Click the Refresh button in the Source Control panel:
   - Verify modified file appears under **Changes**.
   - Verify new file appears under **Untracked**.
4. Click on the modified file to view diffs:
   - The **Git Diff Modal** opens displaying a unified diff with green additions (`+`), red deletions (`-`), and line numbers.
5. Click the **+** (Stage) button next to the modified file:
   - The file moves from **Changes** to **Staged Changes**.
6. Click the **-** (Unstage) button:
   - The file returns to **Changes**.

### Step 3: Create Commits and View History

1. Stage the modified file.
2. Type a commit message into the text area: `feat: test commit from remote ide`.
3. Click **Commit**:
   - Verify the commit succeeds and the staged changes list clears.
4. Click the branch name dropdown to list local branches.
5. Verify branch switching and branch creation work as expected.

### Step 4: Discard Confirmation Guard

1. Modify a tracked file.
2. Click the **Discard** (undo) button next to the file:
   - An explicit confirmation dialog appears asking to confirm discarding changes.
   - If cancelled, changes remain intact.
   - If confirmed, `git checkout -- <file>` runs and the workspace is restored.

---

## 3. Development Process Manager Verification

### Step 1: Open Processes Panel

1. Open the bottom drawer by clicking **Processes** in the bottom panel tabs.
2. Verify the process toolbar shows **Start Process** and **Refresh**.

### Step 2: Start a Managed Process

1. Click **Start Process**:
   - Name: `ping-service`
   - Command: `node -e 'setInterval(() => console.log(new Date().toISOString() + " - Heartbeat ping"), 1000)'`
   - Custom Environment Variables: add `API_KEY=supersecret123`
2. Click **Start**:
   - The process appears in the list with a green `running` badge, PID, uptime, and CPU/RAM usage stats.
   - Select the process to view its live log stream.
   - Verify log lines appear in real-time in the terminal-styled viewer.
   - Verify secret masking: inspecting the process details masks the value of `API_KEY` (displayed as `********`).

### Step 3: Stop and Restart

1. Click **Restart**:
   - The process restarts with an incremented restart count and fresh PID.
2. Click **Stop**:
   - The status updates to `stopped` and process CPU/RAM updates to 0.

---

## 4. Local Port Forwarding & Application Preview

### Step 1: Detect and Forward Ports

1. In the bottom drawer, click the **Ports** tab.
2. Candidate local ports detected on `127.0.0.1` appear in the **Detected Ports** section (e.g., port 3000, 4000).
3. Under **Forward Port**, enter port `3000` (or `4000`) and optional label `Frontend Web`.
4. Click **Forward**:
   - The port is added to the **Forwarded Ports** table with status `Active`, its proxy path `/api/v1/preview/3000/`, and creation timestamp.
5. Test the **Toggle** switch:
   - Switching off disables forwarding (requests to `/api/v1/preview/3000/` return 503).
   - Switching on restores forwarding.

### Step 2: Security & SSRF Protection

1. Attempt to forward an internal database port (e.g. port `5432` or `6379`):
   - The agent rejects the request with code `FORBIDDEN` ("Port 5432 is reserved for internal services").
2. Attempt to forward a privileged system port (< 1024):
   - The agent rejects with code `VALIDATION_ERROR` ("Port must be between 1024 and 65535").

### Step 3: Responsive Application Preview

1. Click the **Preview** tab in the bottom panel or Activity Bar.
2. Select port `3000` from the port dropdown:
   - The embedded web application loads securely through the authenticated preview proxy.
3. Test responsive viewport modes:
   - Click **Desktop** -> preview width expands to full width.
   - Click **Tablet** -> preview width constrains to 768px with centered frame.
   - Click **Mobile** -> preview width constrains to 375px.
4. Click the **Reload** button to refresh the iframe.
5. Click **Pop-out** to open the preview in a new browser tab.

---

## 5. Built-in HTTP / API Client Verification

### Step 1: Configure and Execute HTTP Requests

1. Click the **API Client** icon in the Activity Bar or tab bar.
2. Set Method to `GET`.
3. In the URL address bar, enter: `{{baseUrl}}/api/v1/health`
4. Set Environment Variables:
   - Key: `baseUrl`, Value: `http://localhost:4000`
5. Click **Send**:
   - The request completes.
   - The response panel shows status badge `200 OK`, response duration (e.g., `12ms`), and response size (e.g., `142 B`).
   - The formatted JSON response body is displayed:
     ```json
     {
       "ok": true,
       "timestamp": "..."
     }
     ```

### Step 2: Headers, Query Params, and Authentication

1. Switch to the **Headers** sub-tab:
   - Add `X-Custom-Header: RemoteIDE-Client`.
2. Switch to the **Auth** sub-tab:
   - Select **Bearer Token**, enter `test-token-123`.
3. Switch to the **Body** sub-tab:
   - Select `JSON`, enter `{"action": "test"}`.
4. Click **cURL**:
   - The equivalent `curl` command with interpolated variables, headers, and body is generated and copied to your clipboard.

### Step 3: SSRF Protection

1. In the URL address bar, enter `http://169.254.169.254/latest/meta-data/`.
2. Click **Send**:
   - The agent intercepts the request and rejects it:
     `AppError: FORBIDDEN - Requests to cloud metadata services (169.254.169.254) are forbidden.`

### Step 4: WebSocket Testing Panel

1. In the API Client panel, click the **WebSocket** sub-tab.
2. Enter WebSocket URL: `ws://localhost:4000/tunnel/agent`.
3. Click **Connect**:
   - Connection state updates to `Connected`.
4. Send a text payload: `{"type": "ping"}`.
5. Verify outbound frame is logged in the message list.
6. Click **Disconnect** -> connection terminates cleanly.

---

## 6. Access Control and Permission Boundaries

| Role          | Git Read | Git Commit / Push | Git Destructive | Process Control | Port Forward / Preview | Terminal Execute |
| :------------ | :------: | :---------------: | :-------------: | :-------------: | :--------------------: | :--------------: |
| **Owner**     |   Yes    |        Yes        |       Yes       |       Yes       |          Yes           |       Yes        |
| **Operator**  |   Yes    |        Yes        |  Confirmation   |       Yes       |          Yes           |        No        |
| **Developer** |   Yes    |        Yes        |     Denied      |       Yes       |          Yes           |        No        |
| **Editor**    |   Yes    |      Denied       |     Denied      |     Denied      |         Denied         |        No        |
| **Viewer**    |   Yes    |      Denied       |     Denied      |     Denied      |         Denied         |        No        |

### Verification Steps:

1. **Viewer Session Tests**:
   - Create a temporary share link with **Viewer** role (`/share` modal).
   - Open an incognito browser window and redeem the link.
   - Open Source Control: can view file changes and branches.
   - Attempt to commit: API returns `403 Forbidden` (`git:write` required).
   - Open Processes panel: Start button is disabled / API returns `403 Forbidden` (`process:control` required).
   - Open Ports panel: Forwarding is disabled / API returns `403 Forbidden` (`port:forward` required).
   - Verify interactive terminal is completely inaccessible.

2. **Developer Session Tests**:
   - Redeem a share link with **Developer** role.
   - Can stage, commit, push, start/stop processes, and preview forwarded ports.
   - Attempt to discard changes or force-delete a branch: API returns `403 Forbidden` (`git:destructive` required).

3. **Dual-Layer Enforcement**:
   - The Gateway checks permissions at proxy routing time.
   - The Host Agent verifies the decoded session token permissions again in `tunnel-transport.ts`.
   - Direct requests bypassing the gateway or spoofing headers are rejected by the agent.
