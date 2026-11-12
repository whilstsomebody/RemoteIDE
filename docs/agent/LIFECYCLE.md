# Host Agent Lifecycle & Architecture

The **RemoteIDE Host Agent** (`apps/agent`) is a background daemon that runs directly on the developer's primary computer. It serves as the single authority over the local filesystem, processes, and terminal runtimes.

---

## 1. Network Boundary & Loopback Enforcement

In Phase 1, the Host Agent is strictly bound to the **loopback interface** (`127.0.0.1`).

- The agent does not bind to `0.0.0.0`.
- It cannot be reached directly from external networks or public interfaces.
- Remote device interaction will route through the authenticated Gateway via outbound tunneling.

```
+--------------------------------------------------------------------+
| Local Machine (Host)                                               |
|                                                                    |
|  [Browser Web Shell] ------ HTTP localhost:4001 ------> [Agent]   |
|                                                      (127.0.0.1)   |
|                                                           |        |
|                                            +--------------+-----+  |
|                                            |                    |  |
|                                            v                    v  |
|                                    [Workspace Jail]     [SQLite DB]|
|                                    /Users/.../project   agent.db   |
+--------------------------------------------------------------------+
```

---

## 2. Startup, Readiness, & Shutdown Sequence

### Startup

1. **Host Identity Initialization**:
   - Checks `data/host-identity.json`. If present, reads `hostId` and updates `lastStartedAt`.
   - If missing, generates a unique host identifier (`host_<uuid>`) and records OS platform, architecture, and timestamp.
2. **SQLite Database Initialization**:
   - Opens or creates `agent-journal.sqlite`.
   - Executes DDL for `file_change_journal` and `workspaces`.
   - Ensures performance indexes exist on sequence numbers and workspace IDs.
3. **Workspace Registry & Watcher Activation**:
   - Loads registered workspaces from SQLite.
   - Re-attaches filesystem watchers (`WatcherService`) to all active workspace folders.
4. **HTTP Server Binding**:
   - Fastify starts listening on `127.0.0.1:4001`.
   - Registers error handling, request logging, and CORS for localhost origins.

### Health and Readiness Checks

- **`GET /api/v1/health`**:
  Returns service status, uptime, host identity, and SQLite database connection health.
- **`GET /api/v1/ready`**:
  Returns boolean `ready: true` when SQLite is operational, host identity is verified, and workspace services are prepared to serve traffic.

### Graceful Shutdown (`SIGTERM` / `SIGINT`)

1. Fastify ceases accepting new HTTP requests (`app.close()`).
2. `WatcherService.stopAll()` terminates all active recursive filesystem watchers and flushes debounce timers.
3. `WorkspaceService.close()` and `LocalJournalService.close()` cleanly flush WAL buffers and close the SQLite database.
4. Process terminates with exit code 0.

---

## 3. Crash Recovery & Resilience

- **Durable Local Journal**:
  Every file creation, update, move, or deletion is recorded atomically in the SQLite journal before or immediately after execution.
  If the process crashes or power is lost:
  - Sequence numbers are monotonic and survive restarts.
  - Pending events remain marked `status = 'pending'` until successfully delivered or synced.
- **Atomic Writes**:
  File updates write to a temporary file (`.${filename}.tmp.${uuid}`) and invoke `fsync` before renaming. A crash during a write leaves the existing target file intact.

---

## 4. Workspaces & Filesystem Jails

- **Registration**:
  Workspaces can only be registered with paths that physically exist on the host machine.
- **Jail Security**:
  All operations resolve the canonical target path (`fs.realpathSync`) and confirm that it starts with the canonical root of the workspace.
- **Symlink Protection**:
  Symlinks pointing outside the workspace root are blocked with `SYMLINK_ESCAPE_DETECTED` (HTTP 403).
- **Concurrency Control**:
  Writes accept an optional `expectedETag`. If the file was changed externally, the agent rejects the write with `CONCURRENCY_CONFLICT` (HTTP 409).
