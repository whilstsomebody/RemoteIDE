# RemoteIDE Permissions and Capabilities Matrix

RemoteIDE implements fine-grained, capability-based Role-Based Access Control (RBAC). Permissions are evaluated on every REST endpoint, WebSocket frame, and reverse-tunnel RPC execution.

---

## 1. User Roles Overview

RemoteIDE defines 5 hierarchical user roles:

1. **Owner**: Workspace creator with complete administrative, destructive, and member-management permissions.
2. **Operator**: Infrastructure operator who can run terminals, processes, and debug sessions, but cannot delete the workspace or manage billing.
3. **Developer**: Standard developer who can edit code, stage and commit git changes, run tests, and use the AI assistant.
4. **Editor**: Collaborative editor who can edit files in real time and preview running applications, but cannot execute terminal shell commands or debug sessions.
5. **Viewer**: Strictly read-only participant who can view files, follow participant cursors, and inspect read-only terminal outputs. Cannot edit files or inject CRDT updates.

---

## 2. Capabilities Matrix

| Permission | Description | Owner | Operator | Developer | Editor | Viewer |
|---|---|:---:|:---:|:---:|:---:|:---:|
| `WORKSPACE_READ` | View workspace metadata and file tree |  |  |  |  |  |
| `WORKSPACE_WRITE` | Modify workspace configuration |  |  |  | ❌ | ❌ |
| `WORKSPACE_DELETE` | Delete workspace and all associated data |  | ❌ | ❌ | ❌ | ❌ |
| `FILE_READ` | Read file contents and directory listings |  |  |  |  |  |
| `FILE_WRITE` | Create, modify, rename, or delete files |  |  |  |  | ❌ |
| `TERMINAL_ATTACH` | Attach to or observe terminal output |  |  |  | ❌ | ❌ |
| `TERMINAL_EXEC` | Send keystrokes and execute shell commands |  |  |  | ❌ | ❌ |
| `GIT_READ` | View git status, log, diff, and branches |  |  |  |  |  |
| `GIT_WRITE` | Commit, checkout, branch, and push/pull |  |  |  | ❌ | ❌ |
| `PROCESS_CONTROL` | Start, restart, or kill long-running jobs |  |  |  | ❌ | ❌ |
| `DEBUG_EXEC` | Start or attach DAP debugging sessions |  |  |  | ❌ | ❌ |
| `PREVIEW_ACCESS` | Access port-forwarded web previews |  |  |  |  | ❌ |
| `SHARE_MANAGE` | Create or revoke temporary share links |  |  | ❌ | ❌ | ❌ |
| `AI_CONVERSE` | Ask questions to the Gemini AI assistant |  |  |  |  |  |
| `COLLAB_EDIT` | Submit Yjs collaborative document edits |  |  |  |  | ❌ |

---

## 3. Temporary Share Links & Capability Downgrading

- **Principle of Least Privilege**: When an Owner or Operator creates a share link, they cannot grant permissions exceeding their own.
- **Owner Delegation Guard**: Share links **can never delegate Owner role**. Maximum assignable role for a share link is `Developer`.
- **PIN Protection**: Share links may optionally enforce a 4-8 digit numeric PIN. PIN attempts are rate-limited to 5 failures per 15-minute window.
- **Single-Use & Multi-Use Expiry**: Share links support `maxUses` and `expiresInSeconds`. Once consumed or expired, all sessions derived from the link are immediately invalidated.
