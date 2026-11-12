# RemoteIDE System Architecture

Authoritative architectural specification for RemoteIDE: a secure, local-first, browser-based remote development environment.

---

## 1. Executive Summary & Core Tenets

RemoteIDE allows developers to securely access and control their local computer (development tools, filesystem, processes, compilers, terminals) from remote devices (smartphones, tablets, secondary laptops) through authenticated browser sessions.

### Core Tenets

1. **Host-as-Authority**: The host computer owns all filesystem resources, tools, compilers, language servers, and terminals. Remote devices provide a reactive interface to those resources; they never execute local host commands or store host files directly.
2. **Strict Security Boundaries**: Remote access is strictly scoped to authorized project directories and verified session tokens. The host agent never blindly exposes arbitrary filesystem paths or elevated shells.
3. **Local-First & Resilient**: Disconnections are treated as standard operational states. Host state persists locally in a durable SQLite journal, allowing sessions to reattach seamlessly upon reconnect.
4. **End-to-End Contract Rigor**: All communications across HTTP, WebSocket, and domain event streams adhere to strictly typed, versioned Zod contracts with request and correlation IDs.

---

## 2. System Topology & Component Overview

```
                      +-----------------------------+
                      |       Remote Client         |
                      |   (Browser / Mobile / Web)  |
                      +--------------+--------------+
                                     |
                         HTTPS / WSS | (Session Token)
                                     v
                      +-----------------------------+
                      |       RemoteIDE Gateway     |
                      |  (Fastify HTTP + WebSocket) |
                      +--------------+--------------+
                                     |
            +------------------------+------------------------+
            |                        |                        |
            v                        v                        v
+-----------------------+ +---------------------+ +----------------------+
|     PostgreSQL        | |       Redis         | |     Apache Kafka     |
| (Drizzle ORM)         | | (Session Cache &    | | (KRaft Mode, Domain  |
| Users, Hosts, Sessions| |  PubSub Broadcast)  | |  Event Stream)       |
+-----------------------+ +---------------------+ +----------------------+
                                                              |
                                                              v
                                                   +---------------------+
                                                   |   Worker Service    |
                                                   | (Event Processing & |
                                                   |  Async Tasks)       |
                                                   +---------------------+

                                     ^
                                     | WSS (Authenticated Host Tunnel)
                                     |
                      +-----------------------------+
                      |       Host Agent            |
                      |   (Local Machine Daemon)    |
                      +--------------+--------------+
                             |              |
                             v              v
                     [SQLite Journal]  [Host Resources]
                     (Local Operation  - Filesystem
                      Audit & Replay)  - PTY Terminals
                                       - Compilers & Git
```

### Monorepo Components

| Path              | Name                   | Role                                                         | Technologies                                             |
| ----------------- | ---------------------- | ------------------------------------------------------------ | -------------------------------------------------------- |
| `apps/web`        | RemoteIDE Web Frontend | Responsive dark IDE shell interface                          | Next.js 15, React 19, Tailwind CSS, shadcn/ui primitives |
| `apps/gateway`    | Gateway Service        | Ingress proxy, authentication, REST API, WebSocket broker    | Fastify 5, `@fastify/websocket`, Pino                    |
| `apps/agent`      | Host Agent             | Daemon on user's workstation executing authorized operations | Node.js, Fastify, `node:sqlite` local journal            |
| `apps/worker`     | Background Worker      | Asynchronous event processing and batch jobs                 | Node.js, KafkaJS, ioredis                                |
| `packages/shared` | Shared Contracts       | Shared Zod schemas, error models, envelopes, capabilities    | TypeScript, Zod                                          |
| `packages/db`     | Database Layer         | Schema definitions, migration runner, pool management        | Drizzle ORM, node-postgres                               |
| `packages/ui`     | UI Component Kit       | Reusable theme-consistent UI components                      | Tailwind CSS, Lucide React, clsx, twMerge                |
| `packages/config` | Tooling Configs        | Shared TypeScript and linter presets                         | TypeScript, ESLint, Prettier                             |
| `infra`           | Infrastructure         | Containerized backing services                               | Docker Compose, PostgreSQL 16, Redis 7, Kafka KRaft      |

---

## 3. Local Host Agent versus Cloud Control Plane

| Aspect             | Cloud Control Plane (Gateway & Worker)                           | Local Host Agent (`apps/agent`)                                |
| ------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------- |
| **Location**       | Central server, cloud VM, or self-hosted edge container          | User's local workstation / development machine                 |
| **Authority**      | Manages accounts, host registrations, tokens, access policies    | Authority over local disk, shells, processes, compilers        |
| **Trust Model**    | Semi-trusted relay and policy verifier                           | Fully trusted local executor with hard boundary filters        |
| **Data Retention** | Metadata, session validity, access logs                          | Source code, compiler outputs, terminal buffers, local journal |
| **Outage Impact**  | Gateway downtime pauses remote access; host continues local work | Agent downtime stops remote access for that specific host      |

---

## 4. Control Plane versus Data Plane

### Control Plane

- **Authentication & Pairing**: Host registration with token exchange, remote device pairing with short-lived cryptographically signed tokens.
- **Session Lifecycle**: Creation, renewal, permission assignment, and instant revocation of sessions.
- **Routing & Capabilities**: Capability discovery (OS arch, shell path, allowed directories, feature flags) published by the host.

### Data Plane

- **Filesystem Streams**: Directory listing, file reads, debounced file saves, file watcher events.
- **Interactive Terminal Streams**: Raw PTY input/output streams with window resizing events.
- **Process & Language Server Streams**: Compiling, linting, diagnostics, and process stdout/stderr pipes.

The Gateway ensures that the Data Plane traffic is strictly multiplexed over WebSocket connections carrying valid `sessionId` and authenticated authorization contracts.

---

## 5. Filesystem Authority and Trust Boundaries

1. **Host-Side Path Confinement**:
   - The host agent configures an explicit list of `allowedProjectRoots` upon launch.
   - Any path traversal (`../`) attempting to navigate outside an allowed project root is rejected with `PATH_NOT_ALLOWED` (HTTP 403 / ErrorCode `PATH_NOT_ALLOWED`).
   - System directories (`/etc`, `/var`, `/System`, `C:\Windows`) are explicitly blacklisted.

2. **No Arbitrary Remote Execution**:
   - Terminals are allocated inside the authorized project root working directory.
   - File edits undergo transactional atomic writes on the host.
   - Operations are recorded in the host agent's local SQLite journal for auditability.

---

## 6. Remote Device Authorization & Permissions

Access control uses role-based security combined with fine-grained capability checks:

### Roles & Standard Permissions

- **Owner**: Full access within the configured project root (`fs:read`, `fs:write`, `fs:delete`, `terminal:read`, `terminal:write`, `process:spawn`, `process:kill`, `port:forward`, `settings:write`).
- **Collaborator**: Scoped read/write access (`fs:read`, `fs:write`, `terminal:read`, `terminal:write`, `process:spawn`).
- **Viewer**: Read-only observation (`fs:read`, `terminal:read`).

### Token Validation Workflow

1. Client sends session token with WebSocket handshake or `Authorization: Bearer <token>` header.
2. Gateway verifies token signature and validates expiration against Redis session cache.
3. Gateway injects validated permissions into the WebSocket context.
4. Each RPC call or stream request verifies that the required permission (`Permission[action]`) is granted.

---

## 7. REST versus WebSocket Responsibilities

| Protocol      | Prefix / Endpoint | Responsibilities                                                                                                                                              |
| ------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **REST HTTP** | `/api/v1/*`       | - Health checks (`/health`, `/api/v1/health`)<br>- Authentication and token exchange<br>- Host registration & session management<br>- Static asset delivery   |
| **WebSocket** | `/api/v1/ws`      | - Bi-directional real-time RPC<br>- Terminal PTY multiplexing<br>- Real-time filesystem updates & file watching<br>- Agent heartbeat and ping/pong keepalives |

All WebSocket frames use a standardized envelope:

```json
{
  "version": "1.0.0",
  "type": "agent:heartbeat",
  "id": "req_8f1a23",
  "correlationId": "corr_9123b",
  "timestamp": "2026-11-12T21:00:00.000Z",
  "payload": { ... }
}
```

---

## 8. State and Storage Architecture: PostgreSQL, Redis, Kafka, and SQLite Roles

```
+--------------------+   Persists user accounts, registered hosts, active sessions,
|  PostgreSQL 16     |   and permanent audit records. Managed via Drizzle ORM
|  (Relational DB)   |   with type-safe migrations.
+--------------------+

+--------------------+   Ephemeral fast storage:
|  Redis 7           |   - Active session token cache with TTLs
|  (Cache & Pub/Sub) |   - Rate limiters
|                    |   - Pub/sub messaging across multiple gateway instances
+--------------------+

+--------------------+   Durable event streaming in KRaft mode (no ZooKeeper):
|  Apache Kafka 3.8  |   - High-throughput event audit log
|  (KRaft Engine)    |   - Asynchronous worker event distribution
|                    |   - Host connection status change broadcasts
+--------------------+

+--------------------+   Local host-side append-only journal:
|  Host SQLite       |   - High-performance local audit trail
|  (`node:sqlite`)   |   - Unsent event queue during network disconnection
|                    |   - Zero native C++ dependency overhead
+--------------------+
```

---

## 9. Network Disconnection and Recovery Principles

1. **Heartbeat & Dead Peer Detection**:
   - The Gateway and Host Agent exchange ping/pong frames every 15 seconds.
   - If 3 consecutive intervals elapse without response, the connection is marked `disconnected`.
2. **Exponential Backoff Reconnection**:
   - The Host Agent automatically retries reconnecting to the Gateway using exponential backoff with jitter (initial 1s, max 30s).
3. **Local Journaling During Disconnect**:
   - When offline, host filesystem modifications and operations are buffered locally in the SQLite journal.
   - Once reconnected, the agent drains queued updates and synchronizes state with the Gateway.
4. **Remote Client Session Resumption**:
   - Remote clients retain terminal buffer windows and editor dirty states locally in browser indexedDB/storage.
   - Upon reconnecting, the client issues a `client:attach` message with the last acknowledged message ID, resuming the stream without restarting terminals.

---

## 10. Intended Deployment Topology

1. **Local Self-Hosted (Default Developer Setup)**:
   - Host runs Docker Compose for PostgreSQL, Redis, and Kafka.
   - Host runs Gateway on port 4000, Host Agent on port 4001, and Web UI on port 3000.
   - Remote devices connect via local LAN IP or WireGuard / Tailscale VPN tunnel.

2. **Cloud-Assisted Relay Deployment**:
   - Gateway, Worker, PostgreSQL, Redis, and Kafka run in a cloud container cluster (Kubernetes / ECS).
   - Host Agent connects outbound over WSS to `wss://gateway.remoteide.io/api/v1/ws`.
   - No open inbound firewall ports required on the user's home or office workstation.
