# RemoteIDE Architecture Specification

RemoteIDE is a distributed, multi-tenant remote development environment that bridges local developer workstations and remote clients (desktop browsers, tablets, and mobile PWAs) without requiring open inbound firewall ports on developer machines.

---

## 1. High-Level Architecture Diagram

```mermaid
flowchart TB
    subgraph Clients["Remote Clients"]
        D[Desktop Browser]
        T[Tablet Split-Pane]
        M[Mobile PWA]
    end

    subgraph Edge["Edge / Ingress Layer"]
        Caddy["Caddy Reverse Proxy\nTLS Termination & Security Headers"]
    end

    subgraph ControlPlane["RemoteIDE Control Plane"]
        Gateway["API Gateway (Fastify)\n• Auth & RBAC\n• Rate Limiter\n• Telemetry & Metrics\n• Circuit Breaker\n• Outbox Publisher"]
        Worker["Background Worker\n• Kafka Consumers\n• Audit Event Sink\n• Retention Pruning"]
        Web["Web Server (Next.js)\n• Responsive PWA Shell"]
    end

    subgraph Storage["Persistence & Messaging"]
        PG[("PostgreSQL 16\nUsers, Workspaces, Sessions,\nAudit Events, AI History")]
        RD[("Redis 7\nPresence, PubSub,\nReal-time Metrics")]
        KF[("Apache Kafka\nDurable Event Streams")]
    end

    subgraph Host["Developer Host Machine"]
        Agent["RemoteIDE Host Agent\n• Reverse Tunnel Client\n• SQLite Journal / WAL\n• File Operations\n• PTY Process Manager\n• LSP / DAP Bridge\n• Docker Daemon Bridge"]
        Workspace[("Local Filesystem &\nGit Repository")]
    end

    D & T & M <-->|"HTTPS / WSS"| Caddy
    Caddy <--> Gateway
    Caddy <--> Web
    Gateway <--> PG & RD & KF
    Worker <--> PG & KF
    Agent <-->|"Outbound WSS Reverse Tunnel\n(RPC & Multiplexed Streams)"| Gateway
    Agent <--> Workspace
```

---

## 2. Core Subsystems

### 2.1 Reverse Tunnel Infrastructure
- **Outbound Only**: The Host Agent initiates an outbound TLS WebSocket connection to `/ws/tunnel`. The host firewall requires zero open inbound ports.
- **Multiplexed RPC**: Requests from Gateway to Agent (file reads, executions, git commands, port forward requests) flow over JSON-RPC 2.0 frames over the tunnel.
- **Circuit Breaker**: The Gateway wraps tunnel RPC invocations in a stateful `CircuitBreaker`. If the host agent becomes unresponsive or disconnects, calls fail fast (`503 Service Unavailable`) rather than hanging client requests.

### 2.2 Real-Time Collaboration (Yjs & CodeMirror 6)
- **Authoritative Host Storage**: File contents are authoritative on the host agent filesystem.
- **CRDT Synchronization**: Collaborative sessions maintain a shared `Y.Doc` state synchronized via WebSockets (`/ws/collab`).
- **Permission Boundary**: Viewer (read-only) roles are cryptographically prevented from injecting document update frames.
- **Batched Host Writes**: Edits are flushed to the host disk in debounced, atomic writes to protect flash media and prevent IO starvation.

### 2.3 Event Sourcing & Catch-Up Reconciliation
- **Durable Outbox Pattern**: State mutations produce monotonic integer revisions committed locally to SQLite on the host and forwarded to PostgreSQL / Kafka.
- **Disconnection Reconciliation**: When mobile devices disconnect (e.g. going through a subway or network transition), the gateway tracks their cursor revision. Upon reconnecting, `/api/v1/catchup/summary` provides a net-diff changelog without transmitting the full repository.

### 2.4 Strictly Read-Only AI Assistant
- **Google Gemini SDK Integration**: Communicates with `@google/genai` using streaming token generation.
- **Zero-Mutation Guarantee**: The AI assistant can explain code, suggest diffs, and diagnose error traces, but has zero tools to mutate the local filesystem or execute terminal commands directly.
- **Encrypted Storage**: Gemini API keys are encrypted at rest using AES-256-GCM before storage in the database.

---

## 3. Network & Security Boundaries

```mermaid
flowchart LR
    subgraph PublicUntrusted["Public Internet"]
        Client[Client Browsers]
    end

    subgraph DMZ["DMZ / Ingress"]
        Caddy[Caddy TLS Proxy]
    end

    subgraph PrivateCloud["Internal Infrastructure VPC"]
        GW[API Gateway]
        PG[(PostgreSQL)]
        RD[(Redis)]
        KF[(Kafka)]
    end

    subgraph WorkstationLAN["Host Local Machine"]
        Agent[Host Agent]
        Disk[Filesystem & Shell]
    end

    Client -->|TLS 443| Caddy
    Caddy -->|Internal HTTP| GW
    GW --> PG & RD & KF
    Agent -->|Outbound TLS 443| Caddy
    Agent --> Disk
```

1. **Internal Datastores Unexposed**: PostgreSQL (`5432`), Redis (`6379`), and Kafka (`9092`) listen strictly on private container networks and are never exposed to the public internet.
2. **SSRF Guard**: Gateway and Agent outgoing HTTP requests validate destination IP addresses against RFC 1918, RFC 3927 (link-local/cloud metadata), and infrastructure ports.
3. **Path Traversal Guards**: Every file system access resolves symlinks (`realpath`) and asserts containment within the authorized workspace root.
