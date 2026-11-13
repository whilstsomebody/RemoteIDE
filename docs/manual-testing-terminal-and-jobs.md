# Interactive Terminal and Persistent Execution — Manual Testing Guide

This guide provides end-to-end instructions for testing and validating RemoteIDE's interactive host terminal, PTY persistence, background job manager, and role-based capability boundaries.

---

## 1. Architecture and Security Model

```
 ┌──────────────────────────────────────────────────────────────┐
 │                    Client Browser (xterm.js)                 │
 │  - Tabbed & Split terminal views with xterm.js & addons      │
 │  - Quick Command Launcher for tasks and live log viewer      │
 │  - Dynamic resizing, ANSI colors, clipboard copy/paste       │
 └──────────────────────────────▲───────────────────────────────┘
                                │ Authenticated WebSocket / HTTPS
                                ▼
 ┌──────────────────────────────────────────────────────────────┐
 │                       Remote Gateway                         │
 │  - Capability Guard: Enforces terminal.execute (Owner only)  │
 │  - Multiplexes terminal frames over reverse tunnel           │
 └──────────────────────────────▲───────────────────────────────┘
                                │ Outbound Reverse WS Tunnel
                                ▼
 ┌──────────────────────────────────────────────────────────────┐
 │                      Local Host Agent                        │
 │  - node-pty session registry (Bash, Zsh, Fish, PowerShell)   │
 │  - Ring Buffer: 150KB per terminal with reconnect replay     │
 │  - Background Job Manager: bounded queue, cancellation, logs │
 │  - Dual-layer capability check: rejects non-Owner sessions   │
 │  - Runs under host OS execution identity                     │
 └──────────────────────────────────────────────────────────────┘
```

### Security Isolation

- **OS Identity**: Terminal shells spawned by `node-pty` execute directly on the host under the operating system user account running the agent. They inherit all filesystem, network, and process permissions of that host user.
- **Strict Role-Based Access Control**: Terminal creation, listing, resizing, and streaming are strictly restricted to `UserRole.OWNER`. Sessions with `UserRole.VIEWER`, `UserRole.EDITOR`, or `UserRole.DEVELOPER` without explicit terminal grants receive `403 Forbidden`.
- **Dual-Layer Enforcement**: Authorization is checked at the gateway proxy layer and independently verified again at the agent tunnel transport layer.

### Terminal Persistence & tmux Support

- **PTY Session Registry**: Decouples the lifetime of the shell process from browser WebSocket connections. If a browser tab closes, network drops, or the page refreshes, the PTY process continues running on the host.
- **Ring Buffer Replay**: Each terminal session retains a 150KB sliding output ring buffer. When a client reconnects and attaches to an existing session, the buffer is immediately replayed.
- **tmux Wrapping**: If `tmux` is installed on the host, `TerminalService` can automatically wrap sessions (`tmux new-session -A -s <id> <shell>`), enabling sessions to survive even agent restarts. When tmux is not available, sessions persist as long as the host agent process is running.

---

## 2. End-to-End Verification Steps

### Step 1: Start the Development Environment

1. Start Gateway:

   ```bash
   pnpm --filter @remote-ide/gateway dev
   # Runs on http://localhost:4000
   ```

2. Start Host Agent:

   ```bash
   pnpm --filter @remote-ide/agent dev
   # Connects outbound to Gateway via ws://localhost:4000/tunnel/agent
   ```

3. Start Web App:
   ```bash
   pnpm --filter @remote-ide/web dev
   # Accessible at http://localhost:3000
   ```

---

### Step 2: Interactive Terminal Verification (Owner Session)

1. Open `http://localhost:3000` in your browser and log in as the **Owner**.
2. Open the bottom drawer by clicking the **Terminal** tab or pressing `Ctrl+\``.
3. Click the **+** (New Terminal) button:
   - A new terminal tab opens with the host's default shell (Zsh on macOS, Bash on Linux).
   - Verify prompt displays the current workspace path.
4. Test interactive commands:
   - Run `echo "RemoteIDE Terminal Active"` -> Verify output with ANSI colors.
   - Run `ls -la` -> Verify file listing.
   - Run an interactive tool like `top` or `htop` -> Verify screen updates and interactive navigation.
   - Press `Ctrl+C` -> Verify running process interrupts properly.
5. Test shell selection:
   - Click the dropdown arrow next to the **+** button to choose a different installed shell (e.g., `bash`, `zsh`, `fish`, or `pwsh`).
   - Verify the chosen shell spawns and displays its specific prompt.
6. Test Split View:
   - Click the **Split View** icon in the terminal tab bar.
   - Verify two terminals display side-by-side and can be typed into independently.

---

### Step 3: Browser Detachment & Reconnection (PTY Persistence)

1. In Terminal 1, run a long-running counter command:
   ```bash
   for i in {1..100}; do echo "Count: $i"; sleep 1; done
   ```
2. While the loop is counting, close the browser tab or refresh the page completely (`Cmd+R` / `F5`).
3. Re-open the IDE bottom panel and select Terminal 1:
   - Verify the terminal reconnects seamlessly without killing the process.
   - Verify the output ring buffer replays the missed output and continues streaming new counts until finished.

---

### Step 4: Background Job Manager & Quick Launcher

1. In the bottom panel, switch to the **Tasks** tab.
2. Under "Predefined Tasks", click **Run Build** (`pnpm build`) or **Run Tests** (`pnpm test`):
   - Verify the task transitions from `queued` -> `running`.
   - Verify stdout and stderr logs stream in real-time in the output panel.
   - Verify exit status transitions to `completed` upon success.
3. Test Custom Command execution:
   - In the "Custom Task" input box, type:
     ```bash
     for i in {1..30}; do echo "Step $i"; sleep 1; done
     ```
   - Click **Execute**.
   - Verify the job starts and logs output.
4. Test Process Cancellation:
   - Click **Cancel** on the active task.
   - Verify the host agent issues `SIGTERM` (followed by `SIGKILL` if necessary) and the task status updates to `cancelled`.
5. Test Job Persistence:
   - Start another custom task, close the browser window, and wait 10 seconds.
   - Re-open `http://localhost:3000` -> Tasks tab.
   - Verify the job record displays full historical logs and final exit status.

---

### Step 5: Security & Access Control Enforcement (Viewer / Editor Denial)

1. In the Session & Share dashboard, generate a temporary share link with **Viewer** role.
2. Open an Incognito/Private browser window and navigate to the share link.
3. Verify the following:
   - The **Terminal** tab does not allow creating new shell sessions.
   - Direct API calls to create a terminal (`POST /api/v1/terminals`) return `403 Forbidden` with error code `FORBIDDEN`.
   - Direct WebSocket connection attempts to `/api/v1/terminals/:id/stream` are immediately rejected with HTTP 403.
   - Arbitrary shell command execution is denied; only pre-approved tasks are permitted for authorized roles.

---

### Step 6: PTY Process Cleanup and Resource Management

1. In the terminal tab bar, click the **X** (Close) button on an open terminal.
2. Check host processes (`ps aux | grep zsh` or `ps aux | grep bash`):
   - Verify the child shell process has terminated cleanly.
3. Idle Timeout:
   - Sessions left detached with no client connection for longer than 30 minutes are automatically garbage collected by the host agent.
