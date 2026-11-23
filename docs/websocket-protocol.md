# RemoteIDE WebSocket Protocol Specification

RemoteIDE utilizes WebSockets for real-time bidirectional communication across three distinct channels:
1. **Host Tunnel (`/ws/tunnel`)**: Reverse RPC and streaming bridge between Gateway and Host Agent.
2. **Terminal Streaming (`/ws/terminal`)**: Real-time xterm.js PTY I/O.
3. **Collaborative CRDT (`/ws/collab`)**: Yjs document synchronization and awareness.

---

## 1. Frame Envelope Format

All messages transmitted over WebSocket channels (except binary CRDT frames) follow the standard JSON envelope:

```typescript
interface WsEnvelope<T = unknown> {
  type: string;             // Message discriminator
  id?: string;              // Correlation UUID for RPC requests/responses
  workspaceId?: string;     // Workspace context
  sessionId?: string;       // Caller session ID
  timestamp: string;        // ISO-8601 UTC timestamp
  payload: T;               // Strongly typed payload
}
```

---

## 2. Reverse Tunnel Channel (`/ws/tunnel`)

The reverse tunnel is initiated by the Host Agent to the Gateway.

### Handshake & Authentication
```
Agent                                      Gateway
  │                                           │
  ├─── WS Connect (Bearer Token in Header) ──>│
  │    or `tunnel.auth` initial frame         │
  │<── `tunnel.authenticated` / `401 Close` ──┤
```

### JSON-RPC Over Tunnel
Gateway forwards user actions to the agent as RPC calls:

#### Request (`tunnel.rpc.request`)
```json
{
  "type": "tunnel.rpc.request",
  "id": "req-98765",
  "payload": {
    "method": "fs.readFile",
    "params": {
      "path": "src/app.ts"
    }
  }
}
```

#### Response (`tunnel.rpc.response`)
```json
{
  "type": "tunnel.rpc.response",
  "id": "req-98765",
  "payload": {
    "result": { "content": "..." },
    "error": null
  }
}
```

### Heartbeats & Keep-Alive
- **Interval**: Every 15 seconds.
- Agent sends `tunnel.ping` with `{ "timestamp": "..." }`.
- Gateway responds with `tunnel.pong`.
- If no pong or traffic is observed for 45 seconds, the connection is closed and re-established with exponential backoff.

---

## 3. Terminal Streaming Channel (`/ws/terminal`)

Used by the frontend xterm.js terminal to communicate with the host pseudo-terminal (PTY).

### Query Parameters
- `workspaceId`: Workspace UUID.
- `token`: Session bearer token.
- `terminalId`: Existing terminal session ID (for re-attachment).

### Message Types

| Type | Direction | Payload | Description |
|---|---|---|---|
| `terminal.init` | Client -> Gateway | `{ "cols": 80, "rows": 24, "cwd": "..." }` | Initialize or re-attach to PTY |
| `terminal.data` | Client -> Gateway | `{ "data": "ls -la\r" }` | Keystroke / input stream |
| `terminal.data` | Gateway -> Client | `{ "data": "total 48\r\n..." }` | Output stream from shell |
| `terminal.resize`| Client -> Gateway | `{ "cols": 120, "rows": 40 }` | Resize PTY window dimensions |
| `terminal.exit` | Gateway -> Client | `{ "exitCode": 0 }` | Shell process terminated |

---

## 4. Collaborative CRDT Channel (`/ws/collab`)

Driven by Yjs protocol frames for multi-cursor and simultaneous code editing.

### Permissions & Origin Enforcement
- Gateway validates the WebSocket `Origin` header against configured allowed origins.
- Session capabilities are verified: `Viewer` connections are strictly read-only. Any attempt by a `Viewer` to send `SyncStep2` or `Update` frames results in immediate termination (`4403 Forbidden`).

### Message Encoding
- **SyncStep 1**: Initial vector clock exchange.
- **SyncStep 2**: Missing document update chunks.
- **Update**: Incremental changes dispatched upon local edits.
- **Awareness**: Presence state including user name, color, cursor line, and active selection.

---

## 5. Disconnection & Error Codes

WebSocket close status codes adhere to RFC 6455 and RemoteIDE application-specific extensions:

| Close Code | Reason | Meaning |
|---|---|---|
| `1000` | Normal Closure | Clean disconnect on tab close |
| `4001` | Unauthorized | Missing or expired token |
| `4003` | Forbidden | Insufficient permissions for requested action |
| `4004` | Workspace Not Found | Invalid workspace identifier |
| `4029` | Rate Limited | WebSocket frame rate exceeded |
| `4503` | Host Offline | Host agent is not connected to gateway |
