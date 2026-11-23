<p align="center">
  <img src="apps/web/public/logo.png" alt="RemoteIDE Logo" width="50%" />
</p>

# RemoteIDE

**Secure, local-first, browser-based remote development environment bridging developer workstations with modern web, tablet, and mobile clients through authenticated reverse tunnels.**

## Table of Contents

- [Project Overview](#project-overview)
  - [1 The Problem](#1-the-problem)
  - [2 The Solution](#2-the-solution)
  - [3 Core Objectives](#3-core-objectives)
  - [4 Target Audience & Use Cases](#4-target-audience-use-cases)
  - [5 Design Philosophy](#5-design-philosophy)
- [Features & Functionality](#features-functionality)
  - [1 Outbound Reverse Tunnel Transport](#1-outbound-reverse-tunnel-transport)
  - [2 Responsive Mobile, Tablet & PWA Interface](#2-responsive-mobile-tablet-pwa-interface)
  - [3 CodeMirror 6 Editor & Multi-Buffer State Machine](#3-codemirror-6-editor-multi-buffer-state-machine)
  - [4 Specialized Document Viewers](#4-specialized-document-viewers)
  - [5 Interactive PTY Terminals & Process Manager](#5-interactive-pty-terminals-process-manager)
  - [6 Visual Git Operations & Staging](#6-visual-git-operations-staging)
  - [7 Port Forwarding & Web Previews](#7-port-forwarding-web-previews)
  - [8 Real-Time Yjs Collaborative Editing](#8-real-time-yjs-collaborative-editing)
  - [9 Event Sourcing, Outbox Pattern & Catch-Up Engine](#9-event-sourcing-outbox-pattern-catch-up-engine)
  - [10 Cross-Device Session Handoff](#10-cross-device-session-handoff)
  - [11 Strictly Read-Only Gemini AI Assistant](#11-strictly-read-only-gemini-ai-assistant)
  - [12 Language Server Protocol (LSP) & Debugger (DAP)](#12-language-server-protocol-lsp-debugger-dap)
  - [13 Database Explorer & DevOps Probing](#13-database-explorer-devops-probing)
- [Technology Stack](#technology-stack)
- [System Architecture](#system-architecture)
  - [1 Architectural Style](#1-architectural-style)
  - [2 High-Level Architecture Diagram](#2-high-level-architecture-diagram)
  - [3 Request Lifecycle & Data Flow](#3-request-lifecycle-data-flow)
  - [4 Component Interaction & Capability Enforcement](#4-component-interaction-capability-enforcement)
  - [5 Event Sourcing & Catch-Up Lifecycle](#5-event-sourcing-catch-up-lifecycle)
  - [6 Database Entity-Relationship (ER) Diagram](#6-database-entity-relationship-er-diagram)
- [Project Directory Structure](#project-directory-structure)
- [Prerequisites & System Requirements](#prerequisites-system-requirements)
  - [Host Workstation (Where Code Lives)](#host-workstation-where-code-lives)
  - [Control Plane Server (Cloud or Self-Hosted)](#control-plane-server-cloud-or-self-hosted)
- [Installation & Local Development Setup](#installation-local-development-setup)
- [Environment Variables & Configuration](#environment-variables-configuration)
  - [Gateway Configuration (`apps/gateway/.env`)](#gateway-configuration-appsgatewayenv)
  - [Host Agent Configuration (`apps/agent/.env` or `~/.remoteide/agent.json`)](#host-agent-configuration-appsagentenv-or-remoteideagentjson)
- [Running the Project & Available Commands](#running-the-project-available-commands)
- [API References](#api-references)
  - [1 API Overview & Envelope Schemas](#1-api-overview-envelope-schemas)
  - [2 Authentication & MFA Flow](#2-authentication-mfa-flow)
  - [3 Consolidated Endpoint Summary Table](#3-consolidated-endpoint-summary-table)
  - [4 Authentication & Session Endpoints](#4-authentication-session-endpoints)
  - [5 Temporary Share Links Endpoints](#5-temporary-share-links-endpoints)
  - [6 Workspaces & Filesystem Operations](#6-workspaces-filesystem-operations)
  - [7 Interactive Terminals & Process Execution](#7-interactive-terminals-process-execution)
  - [8 Git Version Control Endpoints](#8-git-version-control-endpoints)
  - [9 Port Forwarding & Web Previews](#9-port-forwarding-web-previews)
  - [10 Cross-Device Handoff & Catch-Up Engine](#10-cross-device-handoff-catch-up-engine)
  - [11 Gemini AI Assistant Endpoints](#11-gemini-ai-assistant-endpoints)
  - [12 Health, Readiness, Liveness & Metrics](#12-health-readiness-liveness-metrics)
  - [13 WebSocket Protocol Specification](#13-websocket-protocol-specification)
  - [14 End-to-End Multi-Endpoint Workflow Examples](#14-end-to-end-multi-endpoint-workflow-examples)
- [Database & Persistence Architecture](#database-persistence-architecture)
  - [1 PostgreSQL Relational Storage](#1-postgresql-relational-storage)
  - [2 Host SQLite WAL Journal](#2-host-sqlite-wal-journal)
  - [3 Migrations & Schema Lifecycle](#3-migrations-schema-lifecycle)
- [Authentication, Authorization & Security](#authentication-authorization-security)
  - [1 Multi-Factor Authentication (RFC 6238 TOTP)](#1-multi-factor-authentication-rfc-6238-totp)
  - [2 Role-Based Access Control (RBAC) Matrix](#2-role-based-access-control-rbac-matrix)
  - [3 Server-Side Request Forgery (SSRF) Protection](#3-server-side-request-forgery-ssrf-protection)
  - [4 Filesystem Sandboxing & Symlink Jail](#4-filesystem-sandboxing-symlink-jail)
  - [5 Sliding-Window Rate Limiting](#5-sliding-window-rate-limiting)
- [Error Handling & Observability](#error-handling-observability)
  - [1 Standardized Error Representation](#1-standardized-error-representation)
  - [2 Structured Logging](#2-structured-logging)
  - [3 Prometheus Metrics & Observability](#3-prometheus-metrics-observability)
- [Testing & Quality Assurance](#testing-quality-assurance)
  - [1 Unit & Integration Test Suites](#1-unit-integration-test-suites)
  - [2 End-to-End System Validation](#2-end-to-end-system-validation)
- [Deployment & Production Setup](#deployment-production-setup)
  - [1 Single-Server Docker Compose Deployment](#1-single-server-docker-compose-deployment)
  - [2 Caddy Automated TLS Reverse Proxy](#2-caddy-automated-tls-reverse-proxy)
  - [3 Host Agent Daemon Service Setup (macOS & Linux)](#3-host-agent-daemon-service-setup-macos-linux)
  - [4 High Availability & Multi-Node Scaling](#4-high-availability-multi-node-scaling)
- [Performance Engineering & Fault Tolerance](#performance-engineering-fault-tolerance)
  - [1 Circuit Breaker Pattern](#1-circuit-breaker-pattern)
  - [2 Database Indexing Strategy](#2-database-indexing-strategy)
- [Troubleshooting & FAQ](#troubleshooting-faq)
  - [Diagnostic Checklist](#diagnostic-checklist)
  - [Common Issues & Remediation](#common-issues-remediation)
- [Contributing Guidelines](#contributing-guidelines)
  - [Workflow](#workflow)
- [Development Workflow](#development-workflow)
- [Limitations & Known Issues](#limitations-known-issues)
- [License](#license)
- [Contact & Support](#contact-support)

## Project Overview

### 1 The Problem
Software development environments are traditionally tethered to high-performance local workstations. When developers step away from their desk - commuting, on-call with a smartphone, traveling with a lightweight tablet, or pairing with colleagues - they face severe operational friction:
1. **Cloud IDE Lock-In & Latency**: Full cloud-hosted environments (e.g. GitHub Codespaces, AWS Cloud9) duplicate compute costs, require moving massive proprietary repositories and container caches to remote datacenters, and struggle with high latency.
2. **Inbound Firewall Obstacles**: Direct remote access to local machines typically requires open router inbound ports, dynamic DNS hacks, port forwarding rules, or vulnerable SSH exposures.
3. **Substandard Mobile UX**: Traditional developer tools scale down poorly to mobile viewports, lacking touch-friendly navigation, specialized programming symbol keyboards, external trackpad support, or offline connection recovery.
4. **Security Vulnerabilities in Remote Sharing**: Ad-hoc collaboration links frequently expose full host filesystems (`/etc/passwd`, `~/.ssh`), allow directory traversal attacks, or grant unrestricted shell privileges to read-only reviewers.

### 2 The Solution
**RemoteIDE** is a local-first, distributed remote development platform designed to bridge local developer hardware with any browser client over outbound-only reverse tunnels. 

The developer's workstation retains complete authority over source code files, compilers, Docker daemons, Git binaries, and language servers. Remote clients - smartphones running progressive web apps (PWAs), tablets with split-pane layouts, and remote desktop browsers - connect through an API Gateway to view, edit, run, debug, and collaborate in real time with zero open inbound firewall ports.

### 3 Core Objectives
- **Zero Inbound Port Exposure**: All host-to-gateway connections are outbound TLS WebSockets multiplexing JSON-RPC requests.
- **Strict Data Plane Isolation**: Unencrypted user source code remains on the host workstation filesystem; control planes persist only metadata, vector clocks, and audit trails.
- **Real-Time Collaboration**: Operational transformation and Conflict-free Replicated Data Types (CRDTs) powered by Yjs and CodeMirror 6 with cryptographic role-based enforcement.
- **Disconnection Resilience**: Offline application shells, local draft buffers, and durable Kafka/SQLite outbox logs with monotonic catch-up reconciliations when devices reconnect.
- **Strictly Read-Only AI Assistance**: Context-aware Google Gemini assistant for code explanation and debugging with zero filesystem-mutation tools.

### 4 Target Audience & Use Cases
- **On-Call Software Engineers**: Inspect error stack traces, tail server processes, and apply hotfixes directly from a smartphone or tablet.
- **Distributed Engineering Teams**: Share temporary, role-restricted, PIN-protected collaboration sessions for interactive code reviews and pairing without transferring repository clones.
- **Remote Workstation Access**: Edit code, run tests, and preview running web applications running on home or office workstations from lightweight laptops anywhere in the world.
- **Cross-Device Continuity**: Seamlessly transition ongoing tasks from a desktop browser to a mobile PWA while commuting using instant session handoff.

### 5 Design Philosophy
- **Local Authority**: The developer's physical disk is the single source of truth. Remote edits are atomic and verified with optimistic concurrency ETags.
- **Defense in Depth**: Zero trust between clients and gateway; capability-based authorization gates on every REST endpoint, WebSocket frame, and RPC invocation.
- **Lightweight Footprint**: Pure TypeScript monorepo with minimal external dependencies. Built-in native Node.js cryptographic primitives (RFC 6238 TOTP, AES-256-GCM) and native SQLite journals.

## Features & Functionality

### 1 Outbound Reverse Tunnel Transport
- **Mechanism**: The Host Agent (`remoteide-agent`) initiates an outbound TLS WebSocket connection to `/ws/tunnel` on the API Gateway.
- **Multiplexed RPC**: File operations, Git executions, process controls, and preview proxies flow across the tunnel as bidirectional JSON-RPC frames over a single TCP socket.
- **Heartbeats & Auto-Recovery**: Ping/pong heartbeats every 15 seconds. If connection drops, exponential backoff with randomized jitter reconnects automatically without disrupting active background shell jobs.

### 2 Responsive Mobile, Tablet & PWA Interface
- **Three Adaptive Layouts**:
  - *Desktop*: Multi-panel resizable layout with activity bar, file explorer, split editor panes, integrated terminal, and AI assistant dock.
  - *Tablet*: Adaptive dual split-pane interface supporting landscape/portrait orientation, external hardware keyboards, and trackpads.
  - *Phone*: Single-focused-panel layout featuring bottom tab navigation (`Files`, `Editor`, `Terminal`, `Git`, `AI`), touch-friendly code selection, and quick actions.
- **Mobile Symbol Bar**: Dedicated touch keyboard row providing immediate access to common programming symbols (`{`, `}`, `[`, `]`, `(`, `)`, `;`, `=>`, `|`, `&`, `\`, `` ` ``), tab indentation, and outdent controls.
- **Progressive Web App (PWA)**: Web App Manifest (`manifest.json`), custom application icons, standalone display mode, and a service worker (`sw.js`) providing an offline application shell.

### 3 CodeMirror 6 Editor & Multi-Buffer State Machine
- **Architecture**: Modular functional editor engine using immutable state transactions and `Compartment` dynamic reconfiguration (fonts, tab sizes, word wrap, themes).
- **Multi-Buffer Management**: Centralized client-side buffer state tracking file path, content, clean/dirty state, ETag, modification timestamps, and external conflict flags.
- **Atomic Optimistic Concurrency**: Every file save transmits an `expectedETag`. If the host file was updated by an external tool or Git checkout, an HTTP 409 conflict dialog prompts the user to resolve or reload.
- **Local Draft Recovery**: Keystrokes are mirrored to browser `localStorage`. Unsaved drafts survive browser crashes or accidental tab closures.

### 4 Specialized Document Viewers
- **Markdown Live Preview**: Instant GitHub Flavored Markdown renderer with interactive checklist toggles and code block copying.
- **JSON Formatter & Validator**: Real-time syntax checking, key/value counts, 2-space indentation formatting, and minification.
- **CSV Tabular Grid**: RFC 4180 compliant CSV parser with row filtering, pagination, and data export.
- **Image Inspector**: Visual canvas renderer for PNG, JPEG, SVG, WebP, and GIF with zoom magnification (25% to 400%) and pixel dimensions.
- **Binary Hex Inspector**: Formats non-text binary assets into offset addresses, hexadecimal bytes, and ASCII representation to prevent file corruption.

### 5 Interactive PTY Terminals & Process Manager
- **PTY Bridging**: High-throughput pseudo-terminal emulation (`node-pty`) streaming raw terminal data over `/ws/terminal` to client xterm.js instances.
- **Terminal Re-attachment**: Terminal sessions persist independently on the host workstation. Clients can disconnect, reload, or hand off across devices and re-attach to the active shell without losing history.
- **Process & Job Manager**: Start, monitor, restart, and terminate background build tasks and long-running daemons with CPU/memory resource gauges.

### 6 Visual Git Operations & Staging
- **Repository Control**: Visual status indicators for modified, staged, untracked, and deleted files.
- **Diff & Log Inspection**: Unified diff renderer showing line-by-line additions/deletions and historical commit logs.
- **Commit & Branch Workflows**: Direct branch creation, checkout switching, staging, and atomic commit authoring.

### 7 Port Forwarding & Web Previews
- **Host Application Tunneling**: Forward local HTTP web servers running on the host machine (e.g. Next.js on `3000`, Vite on `5173`) through the Gateway preview proxy.
- **Preview Isolation**: Served under `/preview/:workspaceId/:port/*` with sandboxed `Content-Security-Policy` and `Referrer-Policy: no-referrer`.
- **Anti-SSRF Protection**: Prevents access to internal infrastructure ports (5432, 6379, 9092) and cloud instance metadata addresses (`169.254.169.254`).

### 8 Real-Time Yjs Collaborative Editing
- **CRDT Synchronization**: Collaborative multi-user editing using Yjs document state matrices synchronized across `/ws/collab`.
- **Awareness & Presence**: Remote cursor positions, text selection highlights, participant names, and assigned color markers.
- **Cryptographic Role Enforcement**: Read-only `Viewer` connections are cryptographically rejected from submitting Yjs update frames or mutating document state.
- **Batched Host Flushes**: Collaborative edits are debounced and committed atomically to the host filesystem to protect flash storage and avoid IO thrashing.

### 9 Event Sourcing, Outbox Pattern & Catch-Up Engine
- **Transactional Outbox**: All state mutations generate strongly-typed `DurableEvent` records committed to local SQLite and PostgreSQL outbox tables.
- **Disconnection Reconciliation**: When a device experiences intermittent connectivity (e.g. subway transit), the gateway tracks its cursor revision. Upon reconnecting, `/api/v1/catchup/summary` returns a consolidated changelog of missed revisions.
- **Monotonic Acknowledgement**: Advancing the changelog cursor via `/api/v1/catchup/ack` ensures seamless incremental data synchronization.

### 10 Cross-Device Session Handoff
- **"Continue on Another Device"**: Persists client UI context (active workspace, open file tabs, split layout, editor cursor line/column, and active terminal session).
- **QR Code & Claim Code**: Instant handoff generation producing a 6-digit PIN or QR code allowing rapid claim and context resumption on a second device.

### 11 Strictly Read-Only Gemini AI Assistant
- **Google Gemini SDK Integration**: Conversational assistant powered by `@google/genai` with streaming Server-Sent Events (SSE).
- **Zero Mutation Guarantee**: Designed strictly for technical explanations, code review suggestions, error stack trace diagnosis, and documentation queries. Contains zero tools or permissions to modify files or execute shell commands.
- **Encrypted API Keys**: User Gemini API keys are encrypted at rest using AES-256-GCM before database persistence.

### 12 Language Server Protocol (LSP) & Debugger (DAP)
- **LSP Bridge**: Interfaces with language servers (e.g. `typescript-language-server`, `pyright`, `gopls`) to provide code completions, diagnostics, hover definitions, and go-to-symbol navigation.
- **DAP Integration**: Debug Adapter Protocol bridge supporting breakpoint inspection, stack frame stepping, and variable evaluation.

### 13 Database Explorer & DevOps Probing
- **Embedded Database Client**: Inspect tables, schemas, and run read-only queries against local SQLite files, PostgreSQL, and MySQL databases directly from the IDE.
- **DevOps Probing**: Inspect local Docker containers, images, and CI environment statuses.

## Technology Stack

| Category | Technology | Purpose & Rationale |
|---|---|---|
| **Language** | TypeScript 5.7+ | End-to-end static type safety across client, gateway, agent, worker, and shared libraries. |
| **Monorepo Engine** | Turborepo & pnpm | Intelligent build pipeline parallelization, caching, and disk-efficient package isolation. |
| **Frontend Framework** | Next.js 15 (React 19) | Modern App Router, optimized SSR/PWA shell, and fast client-side navigation. |
| **Styling & UI Components** | Tailwind CSS 3.4+ | Modular dark-mode IDE design system with responsive layouts and zero runtime CSS overhead. |
| **Code Editor** | CodeMirror 6 | Lightweight, mobile-first functional editor engine with virtual keyboard support and syntax highlighters. |
| **Terminal Emulator** | xterm.js 5.5+ & node-pty | High-performance canvas/DOM terminal renderer and native POSIX/Windows pseudo-terminal bridge. |
| **CRDT Collaboration** | Yjs 13.6+ & y-codemirror.next | Distributed Conflict-free Replicated Data Types for concurrent real-time document synchronization. |
| **API Gateway** | Fastify 5.2+ | High-throughput, low-overhead HTTP framework with native schema compilation and WebSocket routing. |
| **Relational Database** | PostgreSQL 16 (Drizzle ORM) | Central persistent store for users, sessions, workspaces, and audit events with type-safe migrations. |
| **Host Change Journal** | SQLite 3 (WAL mode) | Embedded zero-latency append-only transactional journal on the host agent (`node:sqlite`). |
| **In-Memory Cache & Pub/Sub** | Redis 7 | Distributed session token caching, sliding-window rate limiting, and real-time presence signaling. |
| **Message Streaming** | Apache Kafka 3.8+ (KRaft) | High-throughput durable event streaming engine for outbox distribution and compliance audit logs. |
| **Edge Reverse Proxy** | Caddy 2 | Automated Let's Encrypt TLS certificate generation, HTTP/2 & HTTP/3 termination, and security headers. |
| **AI Assistant** | `@google/genai` (Gemini API) | Official Google SDK for streaming token generation and conversational developer assistance. |
| **Testing Framework** | Vitest 2.1+ & Playwright | Rapid parallel unit testing, in-memory integration validation, and browser end-to-end tests. |
| **Containerization** | Docker & Docker Compose | Production multi-stage container builds and single-command local infrastructure orchestration. |

## System Architecture

### 1 Architectural Style
RemoteIDE employs a **hybrid distributed edge-relay architecture**. The central control plane (Gateway, PostgreSQL, Redis, Kafka, Web) orchestrates identity, rate limiting, session authorization, and event streaming. The data plane resides on the developer's physical workstation (Host Agent, Local Filesystem, PTY, Git). Communication between control plane and data plane is multiplexed over an outbound-only TLS reverse WebSocket tunnel.

### 2 High-Level Architecture Diagram

```mermaid
flowchart TB
    subgraph Clients["Client Access Layer"]
        Desk["Desktop Browser\n(Full IDE View)"]
        Tab["Tablet Client\n(Split-Pane Mode)"]
        Phone["Mobile PWA\n(Focused Panel & Symbol Bar)"]
    end

    subgraph Edge["Ingress & Edge Proxy"]
        Caddy["Caddy Reverse Proxy\nAutomated TLS (443) & Security Headers"]
    end

    subgraph ControlPlane["RemoteIDE Control Plane"]
        Gateway["Fastify API Gateway (:3001)\n• RBAC Capability Gate\n• Sliding-Window Rate Limiter\n• Reverse Tunnel Relay\n• Prometheus Telemetry\n• Outbox Publisher Engine"]
        Web["Next.js Web Server (:3000)\n• Static PWA App Shell\n• Service Worker Caching"]
        Worker["Event Worker Service\n• Kafka Consumer Group\n• Audit Event Sink\n• Retention Pruner"]
    end

    subgraph Datastores["Control Plane Datastores"]
        PG[("PostgreSQL 16\nUsers, Sessions, Workspaces,\nAudit Logs, AI History")]
        RD[("Redis 7\nPresence, Ephemeral Pub/Sub,\nRate Limit Windows")]
        KF[("Apache Kafka (KRaft)\nremoteide.workspace.events\nremoteide.audit.events")]
    end

    subgraph HostAgent["Developer Host Workstation"]
        Agent["Host Agent Daemon (remoteide-agent)\n• Outbound Reverse Tunnel Client\n• Circuit-Breaker Guarded RPC\n• Path Traversal & Symlink Jail\n• PTY Shell Manager (node-pty)\n• LSP / DAP Bridge\n• SQLite Change Journal (WAL)"]
        Workspace[("Local Host Filesystem\nSource Code & Git Repo")]
    end

    Desk & Tab & Phone <-->|"HTTPS / WSS"| Caddy
    Caddy <-->|"HTTP :3000"| Web
    Caddy <-->|"HTTP / WSS :3001"| Gateway
    Gateway <--> PG & RD & KF
    Worker <--> PG & KF
    Agent <-->|"Outbound WSS Tunnel (/ws/tunnel)\n(Multiplexed JSON-RPC)"| Gateway
    Agent <--> Workspace
```

### 3 Request Lifecycle & Data Flow

```mermaid
sequenceDiagram
    autonumber
    participant Browser as Client Browser / Mobile PWA
    participant Caddy as Caddy Proxy
    participant GW as API Gateway
    participant Redis as Redis Cache
    participant Agent as Host Agent
    participant Disk as Host Filesystem

    Browser->>Caddy: GET /api/v1/workspaces/ws-1/files/content?path=src/app.ts
    Caddy->>GW: Forward HTTP Request (Bearer Session Token)
    GW->>GW: 1. Sliding-Window Rate Limit Check (IP / Token)
    GW->>Redis: 2. Authenticate Session Token Hash
    Redis-->>GW: Return RemoteSession (Role: Developer, Capabilities)
    GW->>GW: 3. Verify Capability: FILE_READ permitted
    GW->>Agent: 4. Forward RPC over /ws/tunnel (method: "fs.readFile")
    Agent->>Agent: 5. Path Jail Verification (resolve symlinks via realpathSync)
    Agent->>Disk: 6. Read File & Calculate SHA-1 ETag
    Disk-->>Agent: File Buffer & Metadata
    Agent-->>GW: 7. RPC Response { content, eTag, encoding: "utf-8" }
    GW-->>Caddy: 8. HTTP 200 OK Response Envelope
    Caddy-->>Browser: 9. Deliver JSON Payload to CodeMirror Editor
```

### 4 Component Interaction & Capability Enforcement

```mermaid
flowchart LR
    Caller["Client Request\n(REST / WebSocket)"] --> AuthFilter{"Authenticated?"}
    AuthFilter -- No --> Err401["401 Unauthorized"]
    AuthFilter -- Yes --> RoleGate{"Evaluate Capabilities\n(ROLE_PERMISSIONS)"}
    
    RoleGate -- Missing Perm --> Err403["403 Forbidden\n(Audited to Kafka)"]
    RoleGate -- Permitted --> TargetSelect{"Route Target"}

    TargetSelect --> GatewayNative["Gateway Native Route\n(Auth, ShareLinks, AI, Handoff, Catchup)"]
    TargetSelect --> HostRPC["Tunnel Relay RPC\n(Filesystem, Terminal, Git, Debug)"]

    HostRPC --> Breaker{"Circuit Breaker\nState Check"}
    Breaker -- Open --> Err503["503 Host Agent Offline"]
    Breaker -- Closed / Half-Open --> TunnelTx["Transmit JSON-RPC\nover /ws/tunnel"]
    TunnelTx --> HostJail{"Host Symlink &\nPath Traversal Jail"}
    HostJail -- Escaped --> ErrJail["403 Symlink Escape Detected"]
    HostJail -- Valid --> HostExec["Execute on Workstation Disk / PTY"]
```

### 5 Event Sourcing & Catch-Up Lifecycle

```mermaid
flowchart TD
    subgraph HostMutation["Host Mutation & Outbox"]
        Mutation["Developer Edit / Git Commit"] --> HostWAL["Commit to SQLite WAL Journal\n(Monotonic Revision N)"]
        HostWAL --> RelaySync["Tunnel Sync Forwarding"]
    end

    subgraph ControlPlaneStreaming["Control Plane Stream Processing"]
        RelaySync --> GWOutbox["Gateway Outbox Table\n(status: 'pending')"]
        GWOutbox --> PubLoop["Outbox Background Publisher"]
        PubLoop --> KafkaTopic["Apache Kafka\n(remoteide.workspace.events)"]
        PubLoop --> PGStore[("PostgreSQL\nworkspace_events")]
    end

    subgraph CatchupReconciliation["Catch-Up Engine"]
        PhoneReconnect["Phone B Reconnects\n(Reports Last Ack Rev: 42)"] --> QueryCatchup["GET /api/v1/catchup/summary\n(fromRev: 43, toRev: 50)"]
        QueryCatchup --> PGStore
        PGStore --> GenSummary["Generate Consolidated\nNet-Diff Changelog"]
        GenSummary --> PhoneAck["POST /api/v1/catchup/ack\n(Monotonically Advance Cursor to 50)"]
    end
```

### 6 Database Entity-Relationship (ER) Diagram

```mermaid
erDiagram
    users ||--o{ workspaces : "owns"
    users ||--o{ sessions : "authenticates"
    users ||--o{ ai_conversations : "authors"
    workspaces ||--o{ workspace_events : "emits"
    workspaces ||--o{ share_links : "shares"
    workspaces ||--o{ ai_conversations : "scopes"
    ai_conversations ||--o{ ai_messages : "contains"

    users {
        varchar id PK
        varchar email UK
        varchar password_hash
        varchar role
        boolean mfa_enabled
        varchar mfa_secret
        jsonb mfa_backup_codes
        timestamp created_at
        timestamp updated_at
    }

    workspaces {
        varchar id PK
        varchar name
        varchar host_id
        varchar owner_id FK
        text root_path
        timestamp created_at
    }

    sessions {
        varchar id PK
        varchar user_id FK
        varchar token_hash UK
        varchar role
        varchar device_name
        varchar ip_address
        text user_agent
        timestamp expires_at
        timestamp revoked_at
        timestamp created_at
    }

    workspace_events {
        varchar id PK
        varchar workspace_id FK
        varchar host_id
        bigint revision
        varchar event_type
        varchar actor_id
        jsonb payload
        timestamp created_at
    }

    share_links {
        varchar id PK
        varchar workspace_id FK
        varchar token_hash UK
        varchar role
        int max_uses
        int use_count
        varchar pin_hash
        timestamp expires_at
        timestamp created_at
    }

    ai_conversations {
        varchar id PK
        varchar workspace_id FK
        varchar user_id FK
        varchar title
        timestamp created_at
    }

    ai_messages {
        varchar id PK
        varchar conversation_id FK
        varchar role
        text content
        jsonb attachments
        timestamp created_at
    }

    outbox_events {
        varchar id PK
        varchar topic
        varchar partition_key
        jsonb payload
        varchar status
        int retry_count
        timestamp created_at
        timestamp published_at
    }
```

## Project Directory Structure

```
RemoteIDE/
├── .github/
│   └── workflows/
│       └── ci.yml               # Multi-stage CI/CD workflow (lint, test, build, package)
├── apps/
│   ├── agent/                   # Host Agent Daemon (Runs locally on workstation)
│   │   ├── bin/
│   │   │   └── remoteide-agent.js # Global CLI executable wrapper
│   │   ├── src/
│   │   │   ├── cli.ts           # Service installer (macOS launchd & Linux systemd)
│   │   │   ├── server.ts        # Agent HTTP server & reverse tunnel transport
│   │   │   ├── journal/         # Native SQLite WAL journal implementation
│   │   │   ├── routes/          # Agent HTTP routes (files, git, terminals, ports, etc.)
│   │   │   └── services/        # PTY manager, LSP bridge, filesystem jail, Docker
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── gateway/                 # Central API Gateway & Relay (Runs on server)
│   │   ├── Dockerfile           # Multi-stage production container build
│   │   ├── src/
│   │   │   ├── app.ts           # Fastify application bootstrap & middleware registration
│   │   │   ├── server.ts        # HTTP and WebSocket listening server
│   │   │   ├── routes/          # REST route controllers (auth, ai, catchup, share-links)
│   │   │   └── services/        # Tunnel relay, rate limiter, telemetry, Kafka, Redis
│   │   ├── test/                # Unit, security regression, and E2E validation test suites
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── web/                     # Next.js PWA Frontend (React 19, CodeMirror 6)
│   │   ├── Dockerfile           # Multi-stage production Next.js standalone runner
│   │   ├── public/
│   │   │   ├── logo.png         # Official RemoteIDE logo asset
│   │   │   ├── manifest.json    # Progressive Web App manifest
│   │   │   └── sw.js            # Offline application shell service worker
│   │   ├── src/
│   │   │   ├── app/             # Next.js App Router pages (/, /share, /_not-found)
│   │   │   ├── components/      # Responsive UI shells, CodeMirror editor, terminal, AI
│   │   │   ├── hooks/           # Responsive layout hooks, keybindings, collab hooks
│   │   │   └── lib/             # API client, WebSocket state, Yjs providers
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── worker/                  # Background Event Processor
│       ├── Dockerfile           # Production worker container
│       ├── src/
│       │   └── index.ts         # Kafka consumer groups and retention cleanup
│       └── package.json
├── packages/
│   ├── db/                      # PostgreSQL Drizzle ORM schemas, clients, and migrations
│   │   ├── drizzle/             # Generated SQL migration files
│   │   ├── src/
│   │   │   ├── client.ts        # Connection pool with health probe
│   │   │   └── schema/          # Table definitions (users, sessions, events, ai)
│   │   └── package.json
│   ├── shared/                  # Universal contracts, schemas, and security utilities
│   │   ├── src/
│   │   │   ├── config/          # Environment variable schemas (Zod)
│   │   │   ├── contracts/       # REST DTOs, WebSocket envelopes, RBAC definitions
│   │   │   ├── errors/          # Standard AppError and ErrorCode definitions
│   │   │   └── utils/           # TOTP (RFC 6238), CircuitBreaker, Anti-SSRF, Crypto
│   │   └── package.json
│   └── ui/                      # Reusable UI component library (Tailwind CSS)
│       └── package.json
├── infra/                       # Infrastructure configuration & container orchestration
│   ├── caddy/
│   │   └── Caddyfile            # Production reverse proxy with TLS and security headers
│   ├── docker-compose.yml       # Local development backing services (PG, Redis, Kafka)
│   └── docker-compose.prod.yml  # Production deployment specification
├── eslint.config.mjs            # Unified monorepo ESLint configuration
├── package.json                 # Root monorepo workspace configuration
├── pnpm-workspace.yaml          # Workspace package mapping
├── turbo.json                   # Turborepo build task pipeline definition
└── README.md                    # Centralized project documentation (this document)
```

## Prerequisites & System Requirements

### Host Workstation (Where Code Lives)
- **Operating System**: macOS (12.0+ Monterey or higher) or Linux (Ubuntu 20.04+, Debian 11+, Fedora 38+, Arch Linux).
- **Node.js**: `>= 20.0.0` (Recommended: Node.js 22+ or 24 LTS).
- **Git**: `>= 2.30.0` installed and accessible in `PATH`.
- **Optional**: Docker Engine (for containerized workspace execution and debugging).

### Control Plane Server (Cloud or Self-Hosted)
- **Node.js**: `>= 20.0.0`.
- **pnpm**: `>= 9.0.0` (`npm install -g pnpm`).
- **PostgreSQL**: Version 16+.
- **Redis**: Version 7+.
- **Apache Kafka**: Version 3.6+ (KRaft mode enabled) or Redpanda.
- **Docker & Docker Compose**: v2.20+ (for production containerized deployments).

## Installation & Local Development Setup

Follow these verified step-by-step instructions to get RemoteIDE running locally:

```bash
# Clone the repository
git clone https://github.com/your-org/RemoteIDE.git
cd RemoteIDE

# Install dependencies across all workspace packages
pnpm install

# Start local infrastructure services (PostgreSQL, Redis, Kafka)
pnpm infra:up

# Verify containers are healthy
docker compose -f infra/docker-compose.yml ps

# Run database migrations to provision PostgreSQL schemas
pnpm db:migrate

# Start all applications in development mode with live reload
pnpm dev
```

The services will initialize on the following local endpoints:
- **Web Frontend (PWA)**: `http://localhost:3000`
- **API Gateway**: `http://localhost:3001`
- **Host Agent**: `http://localhost:4001` (Reverse tunnel connects automatically to Gateway)

## Environment Variables & Configuration

RemoteIDE uses strongly-typed Zod schemas (`packages/shared/src/config/env.ts`) to validate environment variables at startup.

### Gateway Configuration (`apps/gateway/.env`)

| Variable | Description | Required | Default / Example |
|---|---|:---:|---|
| `NODE_ENV` | Application runtime environment (`development`, `production`, `test`) | Yes | `development` |
| `PORT` | HTTP and WebSocket listening port | No | `3001` |
| `HOST` | Network interface binding address | No | `0.0.0.0` |
| `DATABASE_URL` | PostgreSQL connection string | Yes | `postgresql://remoteide:remoteide_dev_pass@localhost:5432/remoteide_db` |
| `REDIS_URL` | Redis server connection string | Yes | `redis://localhost:6379` |
| `KAFKA_BROKERS` | Comma-separated list of Kafka broker hostnames | Yes | `localhost:9092` |
| `JWT_SECRET` | Secret key used to sign and verify session JWTs (minimum 16 characters) | Yes | `dev-super-secret-jwt-key-min-16-chars` |
| `SETUP_TOKEN` | Initial bootstrap token for claiming the Owner account | No | Auto-generated in `~/.remoteide/setup-token` if unset |
| `CORS_ORIGIN` | Allowed client origin for CORS and WebSocket handshake verification | No | `http://localhost:3000` |
| `LOG_LEVEL` | Pino logging threshold (`trace`, `debug`, `info`, `warn`, `error`) | No | `info` |

### Host Agent Configuration (`apps/agent/.env` or `~/.remoteide/agent.json`)

| Variable | Description | Required | Default / Example |
|---|---|:---:|---|
| `HOST_IDENTIFIER` | Unique machine identifier for this host workstation | No | `local-host-agent` |
| `PORT` | Local agent HTTP listening port | No | `4001` |
| `HOST` | Loopback binding address | No | `127.0.0.1` |
| `GATEWAY_WS_URL` | WebSocket endpoint for the Gateway reverse tunnel | Yes | `ws://127.0.0.1:3001/ws/tunnel` |
| `AGENT_AUTH_TOKEN` | Pre-shared token authorizing host connection to Gateway | Yes | `agt_sec_0192837465abcdef` |
| `SQLITE_JOURNAL_PATH`| Filesystem path for the host SQLite change journal database | No | `~/.remoteide/state.sqlite` |
| `ALLOWED_PROJECT_ROOTS`| Colon-delimited list of root paths allowed for workspace registration | No | Current working directory |

## Running the Project & Available Commands

RemoteIDE leverages Turborepo to coordinate tasks across packages:

```bash
# Development & Execution
pnpm dev              # Start all packages in parallel watch mode
pnpm build            # Compile production builds across all packages
pnpm start            # Run compiled production binaries

# Verification & Code Quality
pnpm typecheck        # Run TypeScript type check across all 8 packages
pnpm lint             # Run ESLint validation across all applications and packages
pnpm test             # Run all Vitest unit and integration test suites
pnpm test:e2e         # Execute Playwright browser automation tests

# Database Operations
pnpm db:generate      # Generate Drizzle migration files from TypeScript schema
pnpm db:migrate       # Apply pending migrations to PostgreSQL database
pnpm db:push          # Push schema changes directly (prototyping)
pnpm db:studio        # Open Drizzle Studio visual database inspector

# Infrastructure Management
pnpm infra:up         # Launch PostgreSQL, Redis, and Kafka Docker containers
pnpm infra:down       # Stop and remove infrastructure containers
pnpm infra:logs       # Tail logs from infrastructure containers
```

## API References

### 1 API Overview & Envelope Schemas
All REST API endpoints are served under `/api/v1` and return standardized JSON envelopes.

#### Success Envelope (`200 OK`, `201 Created`)
```json
{
  "success": true,
  "data": { ... },
  "error": null,
  "meta": {
    "requestId": "req_01928374",
    "correlationId": "cor_01928374",
    "timestamp": "2026-11-23T18:00:00.000Z"
  }
}
```

#### Error Envelope (`400`, `401`, `403`, `404`, `429`, `500`)
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required. Please provide a valid Bearer token.",
    "details": null
  },
  "meta": {
    "requestId": "req_01928374",
    "timestamp": "2026-11-23T18:00:00.000Z"
  }
}
```

### 2 Authentication & MFA Flow
1. **Initial Bootstrap**: First-time server setup requires calling `POST /api/v1/auth/bootstrap` with the `SETUP_TOKEN` from server logs or environment to establish the primary Owner account.
2. **Session Authentication**: Pass the session token in the HTTP header:
   ```
   Authorization: Bearer <token>
   ```
3. **MFA Enforcement**: If a user account has MFA enabled, `POST /api/v1/auth/login` returns `{ "mfaRequired": true, "mfaTicket": "mfa_..." }`. The caller must supply the ticket and a 6-digit TOTP code to `POST /api/v1/auth/mfa/authenticate` to obtain their session token.

### 3 Consolidated Endpoint Summary Table

| Method | Endpoint Path | Description | Access Control |
|---|---|---|---|
| `POST` | `/api/v1/auth/bootstrap` | Initialize primary Owner account | Public (Loopback + Setup Token) |
| `POST` | `/api/v1/auth/login` | Authenticate with email and password | Public (Rate Limited) |
| `POST` | `/api/v1/auth/logout` | Invalidate current session token | Authenticated Session |
| `GET` | `/api/v1/auth/session` | Get caller session metadata | Authenticated Session |
| `GET` | `/api/v1/auth/sessions` | List active sessions for account | Authenticated Session |
| `DELETE` | `/api/v1/auth/sessions/:id` | Revoke a specific active session | Authenticated Session |
| `POST` | `/api/v1/auth/mfa/setup` | Generate TOTP secret and backup codes | Authenticated Session |
| `POST` | `/api/v1/auth/mfa/verify` | Verify code and activate MFA | Authenticated Session |
| `POST` | `/api/v1/auth/mfa/disable` | Disable MFA using code or backup code | Authenticated Session |
| `POST` | `/api/v1/auth/mfa/authenticate`| Complete login with MFA code | Public (Valid MFA Ticket) |
| `POST` | `/api/v1/share-links` | Create role-restricted share link | `SHARE_MANAGE` (Owner/Operator) |
| `GET` | `/api/v1/share-links` | List active share links | `SHARE_MANAGE` (Owner/Operator) |
| `DELETE` | `/api/v1/share-links/:id` | Revoke a share link | `SHARE_MANAGE` (Owner/Operator) |
| `POST` | `/api/v1/share-links/redeem` | Exchange share token for session | Public (Valid Share Token) |
| `GET` | `/api/v1/workspaces` | List accessible workspaces | `WORKSPACE_READ` |
| `POST` | `/api/v1/workspaces` | Register a new host workspace | `WORKSPACE_WRITE` (Owner) |
| `DELETE` | `/api/v1/workspaces/:id` | Remove a workspace registration | `WORKSPACE_DELETE` (Owner) |
| `GET` | `/api/v1/workspaces/:id/files` | List directory contents | `FILE_READ` |
| `GET` | `/api/v1/workspaces/:id/files/content` | Read text/binary file content | `FILE_READ` |
| `PUT` | `/api/v1/workspaces/:id/files/content` | Atomic file write with ETag | `FILE_WRITE` |
| `POST` | `/api/v1/workspaces/:id/exec` | Execute shell command on host | `TERMINAL_EXEC` (Developer+) |
| `GET` | `/api/v1/workspaces/:id/git/status` | Get Git staging and branch status | `GIT_READ` |
| `POST` | `/api/v1/workspaces/:id/git/commit` | Create Git commit | `GIT_WRITE` (Developer+) |
| `POST` | `/api/v1/workspaces/:id/ports` | Forward local port for web preview | `PREVIEW_ACCESS` (Editor+) |
| `POST` | `/api/v1/handoff/state` | Save UI state for cross-device resume | Authenticated Session |
| `GET` | `/api/v1/handoff/state` | Retrieve persisted handoff UI state | Authenticated Session |
| `GET` | `/api/v1/catchup/summary` | Query net-diff missed revisions | Authenticated Session |
| `POST` | `/api/v1/catchup/ack` | Acknowledge changelog receipt | Authenticated Session |
| `POST` | `/api/v1/ai/conversations` | Create conversational AI thread | `AI_CONVERSE` |
| `POST` | `/api/v1/ai/conversations/:id/stream` | Stream Gemini answer via SSE | `AI_CONVERSE` (Read-Only) |
| `GET` | `/health` | Basic liveness probe | Public |
| `GET` | `/health/readiness` | Deep readiness check (DB, Redis, Kafka)| Public |
| `GET` | `/metrics` | Prometheus metrics scrape target | Public / Internal |

---

### 4 Authentication & Session Endpoints

#### `POST /api/v1/auth/bootstrap`
Initialize the primary Owner account on first startup. Must be invoked from trusted loopback or supply valid setup token.

```bash
curl -X POST http://localhost:3001/api/v1/auth/bootstrap \
  -H "Content-Type: application/json" \
  -d '{
    "email": "owner@remoteide.dev",
    "password": "CorrectHorseBatteryStaple123!",
    "displayName": "Lead Architect",
    "localSetupToken": "setup_sec_abc123..."
  }'
```

**Response (`201 Created`)**:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "usr_01928374",
      "email": "owner@remoteide.dev",
      "role": "owner"
    },
    "sessionToken": "ses_01928374abcdef..."
  }
}
```

### 5 Temporary Share Links Endpoints

#### `POST /api/v1/share-links`
Create an ephemeral, role-restricted, cryptographically hashed access link.

```bash
curl -X POST http://localhost:3001/api/v1/share-links \
  -H "Authorization: Bearer <sessionToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "workspaceId": "ws_123456",
    "role": "viewer",
    "expiresInSeconds": 3600,
    "maxUses": 5,
    "pin": "4829"
  }'
```

**Response (`201 Created`)**:
```json
{
  "success": true,
  "data": {
    "rawToken": "sh_live_01928374...",
    "shareLink": {
      "id": "lnk_01928374",
      "workspaceId": "ws_123456",
      "role": "viewer",
      "expiresAt": "2026-11-23T19:00:00.000Z",
      "maxUses": 5,
      "useCount": 0
    }
  }
}
```
*Note: The raw token is returned once upon creation; only its SHA-256 hash is persisted in the database.*

### 6 Workspaces & Filesystem Operations

#### `GET /api/v1/workspaces/:id/files/content`
Read text or binary file contents with concurrency ETag.

```bash
curl -X GET "http://localhost:3001/api/v1/workspaces/ws_123456/files/content?path=src/index.ts" \
  -H "Authorization: Bearer <sessionToken>"
```

**Response (`200 OK`)**:
```json
{
  "success": true,
  "data": {
    "path": "src/index.ts",
    "content": "console.log('Hello from RemoteIDE');\n",
    "encoding": "utf-8",
    "isBinary": false,
    "size": 38,
    "eTag": "w_9a8b7c6d5e4f3a2b1c",
    "mtime": 1700000000000
  }
}
```

#### `PUT /api/v1/workspaces/:id/files/content`
Perform an atomic write with optimistic concurrency control.

```bash
curl -X PUT http://localhost:3001/api/v1/workspaces/ws_123456/files/content \
  -H "Authorization: Bearer <sessionToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "path": "src/index.ts",
    "content": "console.log(\"Updated code\");\n",
    "expectedETag": "w_9a8b7c6d5e4f3a2b1c"
  }'
```

**Response (`200 OK`)**:
```json
{
  "success": true,
  "data": {
    "bytesWritten": 31,
    "eTag": "w_112233445566778899"
  }
}
```

### 7 Interactive Terminals & Process Execution

#### `POST /api/v1/workspaces/:id/exec`
Run a non-interactive shell command on the host machine.

```bash
curl -X POST http://localhost:3001/api/v1/workspaces/ws_123456/exec \
  -H "Authorization: Bearer <sessionToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "command": "git",
    "args": ["status", "--short"],
    "cwd": "."
  }'
```

**Response (`200 OK`)**:
```json
{
  "success": true,
  "data": {
    "exitCode": 0,
    "stdout": " M src/index.ts\n",
    "stderr": ""
  }
}
```

---

### 8 Git Version Control Endpoints

#### `GET /api/v1/workspaces/:id/git/status`
Retrieve repository branch status, staged, and unstaged modifications.

```bash
curl -X GET http://localhost:3001/api/v1/workspaces/ws_123456/git/status \
  -H "Authorization: Bearer <sessionToken>"
```

**Response (`200 OK`)**:
```json
{
  "success": true,
  "data": {
    "branch": "main",
    "clean": false,
    "staged": [],
    "unstaged": ["src/index.ts"],
    "untracked": []
  }
}
```

### 9 Port Forwarding & Web Previews

#### `POST /api/v1/workspaces/:id/ports`
Request dynamic port forwarding for application preview.

```bash
curl -X POST http://localhost:3001/api/v1/workspaces/ws_123456/ports \
  -H "Authorization: Bearer <sessionToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "port": 3000,
    "protocol": "http"
  }'
```

**Response (`200 OK`)**:
```json
{
  "success": true,
  "data": {
    "port": 3000,
    "previewUrl": "https://ide.yourdomain.com/preview/ws_123456/3000/"
  }
}
```
*Security Guard: Submitting internal infrastructure ports (5432, 6379, 9092) or cloud metadata targets returns HTTP 400 Bad Request.*

### 10 Cross-Device Handoff & Catch-Up Engine

#### `GET /api/v1/catchup/summary`
Retrieve a net-diff changelog of revisions missed during network disconnection.

```bash
curl -X GET "http://localhost:3001/api/v1/catchup/summary?workspaceId=ws_123456&deviceId=phone-b" \
  -H "Authorization: Bearer <sessionToken>"
```

**Response (`200 OK`)**:
```json
{
  "success": true,
  "data": {
    "deliveryId": "del_01928374",
    "workspaceId": "ws_123456",
    "deviceId": "phone-b",
    "fromRevision": 42,
    "toRevision": 48,
    "totalEvents": 6,
    "totalFilesAffected": 1,
    "netChanges": {
      "filesModified": ["src/index.ts"]
    }
  }
}
```

#### `POST /api/v1/catchup/ack`
Monotonically advance the device's acknowledged changelog cursor.

```bash
curl -X POST http://localhost:3001/api/v1/catchup/ack \
  -H "Authorization: Bearer <sessionToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "deliveryId": "del_01928374",
    "workspaceId": "ws_123456",
    "deviceId": "phone-b"
  }'
```

### 11 Gemini AI Assistant Endpoints

*Note: The assistant is strictly read-only and cannot mutate local files or execute commands.*

#### `POST /api/v1/ai/conversations/:id/stream`
Stream an answer from Google Gemini using Server-Sent Events (SSE).

```bash
curl -X POST http://localhost:3001/api/v1/ai/conversations/conv_123/stream \
  -H "Authorization: Bearer <sessionToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Explain why this TypeScript function threw a TypeError at runtime.",
    "attachments": [
      {
        "type": "code_snippet",
        "title": "app.ts",
        "content": "const x: any = null; x.run();"
      }
    ]
  }'
```

**SSE Stream Output**:
```
data: {"chunk":"The TypeError occurs because the variable `x` is explicitly assigned `null`..."}

data: {"chunk":"\n\nTo resolve this, add an optional chaining operator or null check."}

event: done
data: {}
```

### 12 Health, Readiness, Liveness & Metrics

#### `GET /health/readiness`
Deep dependency verification checking PostgreSQL connection, Redis ping, and Kafka broker state.

```bash
curl -s http://localhost:3001/health/readiness
```

**Response (`200 OK`)**:
```json
{
  "status": "ready",
  "dependencies": {
    "database": { "status": "healthy" },
    "redis": { "status": "healthy" },
    "kafka": { "status": "healthy" }
  },
  "timestamp": "2026-11-23T18:00:00.000Z"
}
```

#### `GET /metrics`
Prometheus metrics scrape target reporting HTTP request durations (p50, p90, p95, p99), active WebSocket connections, and rate-limiting counters.

```bash
curl -s http://localhost:3001/metrics
```

### 13 WebSocket Protocol Specification

RemoteIDE maintains three dedicated WebSocket communication channels:

```mermaid
flowchart TD
    subgraph WsChannels["WebSocket Multiplexing"]
        Tunnel["/ws/tunnel\n(Host Agent <-> Gateway)\n• Bidirectional JSON-RPC\n• Ping / Pong Keep-Alive (15s)"]
        Terminal["/ws/terminal\n(Browser <-> PTY Shell)\n• Keystroke Streaming (xterm.js)\n• Window Resize Events"]
        Collab["/ws/collab\n(Browser <-> Yjs CRDT Room)\n• Vector Clock Exchange\n• Awareness (Cursor & Color)\n• Cryptographic Viewer Lockout"]
    end
```

#### Standard JSON Frame Envelope
```typescript
interface WsEnvelope<T = unknown> {
  type: string;             // Message discriminator (e.g. "terminal.data", "tunnel.rpc.request")
  id?: string;              // Correlation UUID
  workspaceId?: string;     // Workspace context
  sessionId?: string;       // Caller session ID
  timestamp: string;        // ISO-8601 UTC
  payload: T;               // Strongly typed payload
}
```

### 14 End-to-End Multi-Endpoint Workflow Examples

#### Complete Scenario: Device Pairing & Catch-Up Workflow
1. **Host Registers**: Workstation connects via `WSS /ws/tunnel`.
2. **Client Logs In**: Developer logs in via `POST /api/v1/auth/login` and receives session token.
3. **Workspace Selected**: Client calls `GET /api/v1/workspaces` and opens `src/app.ts` via `GET /api/v1/workspaces/:id/files/content`.
4. **Edits Saved**: Developer updates file via `PUT /api/v1/workspaces/:id/files/content` passing `expectedETag`.
5. **Session Interrupted**: Client drops offline. Host modifies files locally.
6. **Reconnection & Sync**: Client reconnects, queries `GET /api/v1/catchup/summary`, displays net changes, and posts `POST /api/v1/catchup/ack` to sync state.

## Database & Persistence Architecture

### 1 PostgreSQL Relational Storage
PostgreSQL 16 serves as the persistent system of record in the control plane:
- **`users`**: User identities, scrypt password hashes, and encrypted MFA TOTP secrets.
- **`workspaces`**: Workspace metadata and registered host IDs.
- **`sessions`**: Active sessions indexed by `token_hash` for constant-time authentication lookups.
- **`workspace_events`**: Immutable event log with composite indexes on `(workspace_id, revision)`.
- **`outbox_events`**: Transactional outbox table for reliable Kafka message publishing.
- **`ai_conversations` & `ai_messages`**: Encrypted conversation history for the Gemini assistant.

### 2 Host SQLite WAL Journal
The Host Agent writes local events, offline edits, and CRDT snapshots to `~/.remoteide/state.sqlite` using SQLite in Write-Ahead Logging (`WAL`) mode:
- Guarantees crash durability even if the host machine loses power.
- Provides zero-latency local outbox queuing during network partitions.

### 3 Migrations & Schema Lifecycle
Database schemas are defined in `packages/db/src/schema/` using Drizzle ORM:
```bash
# Generate SQL migration scripts
pnpm db:generate

# Execute migrations against PostgreSQL
pnpm db:migrate
```

## Authentication, Authorization & Security

### 1 Multi-Factor Authentication (RFC 6238 TOTP)
- Implemented natively using Node.js `node:crypto` with zero third-party library dependencies.
- Standard HMAC-SHA1 30-second time-step algorithm with drift window tolerance (±1 step).
- **Hashed Backup Codes**: Single-use recovery codes generated via `crypto.randomBytes(4).toString('hex')`. Stored strictly as SHA-256 hashes and consumed atomically upon use.

### 2 Role-Based Access Control (RBAC) Matrix

| Capability | Description | Owner | Operator | Developer | Editor | Viewer |
|---|---|:---:|:---:|:---:|:---:|:---:|
| `WORKSPACE_READ` | Browse file tree and metadata | Yes | Yes | Yes | Yes | Yes |
| `WORKSPACE_WRITE` | Modify workspace configuration | Yes | Yes | Yes | No | No |
| `WORKSPACE_DELETE` | Delete workspace registration | Yes | No | No | No | No |
| `FILE_READ` | Inspect file contents | Yes | Yes | Yes | Yes | Yes |
| `FILE_WRITE` | Create, modify, or delete files | Yes | Yes | Yes | Yes | No |
| `TERMINAL_ATTACH` | Attach to or observe terminal output | Yes | Yes | Yes | No | No |
| `TERMINAL_EXEC` | Send keystrokes and run shell commands | Yes | Yes | Yes | No | No |
| `GIT_READ` | View status, log, diff, and branches | Yes | Yes | Yes | Yes | Yes |
| `GIT_WRITE` | Commit, branch, and stage modifications | Yes | Yes | Yes | No | No |
| `PROCESS_CONTROL` | Start, restart, or kill processes | Yes | Yes | Yes | No | No |
| `PREVIEW_ACCESS` | Access port-forwarded web previews | Yes | Yes | Yes | Yes | No |
| `SHARE_MANAGE` | Create or revoke temporary share links | Yes | Yes | No | No | No |
| `COLLAB_EDIT` | Inject Yjs CRDT collaborative edits | Yes | Yes | Yes | Yes | No |

### 3 Server-Side Request Forgery (SSRF) Protection
To prevent attackers from using the Host Agent or Gateway as a network pivot:
- **Blocked Cloud Metadata IPs**: `169.254.169.254`, `metadata.google.internal`, `100.100.100.200`.
- **Blocked Infrastructure Ports**: `5432` (PostgreSQL), `6379` (Redis), `9092` (Kafka), `2375/2376` (Docker daemon).

### 4 Filesystem Sandboxing & Symlink Jail
Every filesystem access resolves symlinks (`fs.realpathSync`) and asserts strict containment within the authorized workspace root folder:
```typescript
export function validateWorkspacePath(workspaceRoot: string, targetPath: string): string {
  const safeRoot = path.resolve(workspaceRoot);
  const target = path.resolve(safeRoot, targetPath);
  if (!target.startsWith(safeRoot + path.sep) && target !== safeRoot) {
    throw new AppError(ErrorCode.FORBIDDEN, "Directory traversal detected");
  }
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

### 5 Sliding-Window Rate Limiting
In-memory and Redis-backed sliding-window rate limiters enforce requests-per-minute quotas:
- Authentication endpoints: 20 requests / 15 minutes per IP.
- Standard API endpoints: 300 requests / minute per token/IP.

## Error Handling & Observability

### 1 Standardized Error Representation
All operational exceptions extend `AppError`:
```typescript
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly statusCode: number = 400,
    public readonly details?: unknown
  ) {
    super(message);
  }
}
```

### 2 Structured Logging
Fastify and Host Agent utilize Pino for structured JSON logging:
- Every request is tagged with an automated `requestId` and `correlationId`.
- Sensitive tokens and passwords are redacted from log outputs.

### 3 Prometheus Metrics & Observability
- Endpoint: `GET /metrics`
- Tracks HTTP request durations (histograms for p50, p90, p95, p99), active WebSocket connection gauges, rate-limiting drops, and Kafka producer/consumer lag.

## Testing & Quality Assurance

### 1 Unit & Integration Test Suites
RemoteIDE maintains extensive automated test suites using Vitest:
- `@remote-ide/shared`: Tests for envelopes, TOTP generation/verification, circuit breakers, and anti-SSRF guards.
- `@remote-ide/db`: Schema verification, connection pooling, and migration tests.
- `@remote-ide/agent`: Filesystem jail, PTY manager, Git operations, and SQLite journal tests (23 test files, 101 tests).
- `@remote-ide/gateway`: Auth, rate limiting, share links, catch-up reconciliation, and AI streaming tests (15 test files, 70 tests).

```bash
# Run all unit and integration test suites
pnpm test
```

### 2 End-to-End System Validation
The automated test suite in `apps/gateway/test/phase13-production-validation.test.ts` executes an end-to-end multi-device pairing scenario:
- Bootstraps Owner account on Computer A.
- Connects Phone B via cross-device handoff.
- Executes collaborative file editing and terminal commands.
- Disconnects Phone B and makes local offline edits on Computer A.
- Reconnects Phone B and validates catch-up changelog delivery and acknowledgement.
- Validates strictly read-only Gemini AI assistant interactions.
- Creates and validates temporary single-use share links with role downgrade enforcement.

## Deployment & Production Setup

### 1 Single-Server Docker Compose Deployment
Production deployments run in containerized environments defined in `infra/docker-compose.prod.yml`:

```bash
# Enter the infrastructure directory
cd infra

# Configure production environment secrets
cp .env.example .env
nano .env

# Build and launch all production containers
docker compose -f docker-compose.prod.yml up -d --build

# View running services
docker compose -f docker-compose.prod.yml ps
```

### 2 Caddy Automated TLS Reverse Proxy
Caddy manages automated Let's Encrypt certificates and injects strict security headers:
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`

### 3 Host Agent Daemon Service Setup (macOS & Linux)
The Host Agent CLI (`remoteide-agent`) installs background daemons that survive reboots and restarts:

#### macOS (`launchd`)
```bash
# Install LaunchAgent plist (~/Library/LaunchAgents/com.remoteide.agent.plist)
remoteide-agent install

# Check service status and health
remoteide-agent status
remoteide-agent health

# Stream live agent logs
remoteide-agent logs -f

# Stop or restart
remoteide-agent restart
remoteide-agent stop
```

#### Linux (`systemd`)
```bash
# Install user systemd unit (~/.config/systemd/user/remoteide-agent.service)
remoteide-agent install

# Enable lingering so agent runs without GUI session
loginctl enable-linger $USER

# Service management
remoteide-agent status
remoteide-agent restart
```

### 4 High Availability & Multi-Node Scaling
- **Stateless Gateways**: Gateway instances maintain zero local state (sessions are stored in Redis/PostgreSQL). Deploy multiple gateway instances behind an AWS Application Load Balancer or Cloudflare.
- **Sticky WebSockets**: Enable sticky sessions on edge proxies to avoid redundant WebSocket handshakes.
- **Managed Datastores**: Swap containerized PostgreSQL, Redis, and Kafka with AWS RDS, AWS ElastiCache, and Amazon MSK for production scale.

## Performance Engineering & Fault Tolerance

### 1 Circuit Breaker Pattern
The Gateway wraps all reverse tunnel RPC operations in a stateful `CircuitBreaker`:
- **`CLOSED`**: Standard operation. RPC calls flow freely.
- **`OPEN`**: Tripped after 5 consecutive timeouts/failures. Rejects subsequent requests immediately with HTTP 503 rather than holding client connections open.
- **`HALF_OPEN`**: Enters probe mode after a 10-second recovery timeout. If 2 consecutive probe requests succeed, the breaker resets to `CLOSED`.

### 2 Database Indexing Strategy
To ensure sub-millisecond query execution under load:
- Composite index on `workspace_events(workspace_id, revision)` for fast catch-up queries.
- Composite index on `outbox_events(status, created_at)` for rapid polling of pending messages.
- Unique index on `sessions(token_hash)` for instant authorization checks.
- Composite index on `ai_conversations(workspace_id, user_id)`.

## Troubleshooting & FAQ

### Diagnostic Checklist
```bash
# Check Gateway health and readiness
curl -s http://localhost:3001/health/readiness | jq .

# Check Host Agent service status
remoteide-agent status

# Check real-time Prometheus HTTP latency metrics
curl -s http://localhost:3001/metrics | grep remoteide_http_request
```

### Common Issues & Remediation

#### Q: "Host agent is offline or unreachable over reverse tunnel (HTTP 503)"
- **Cause**: The workstation agent daemon is stopped or cannot resolve the Gateway WebSocket URL.
- **Fix**: Run `remoteide-agent status` on the host workstation. Ensure `GATEWAY_WS_URL` in `~/.remoteide/agent.json` matches your server's public endpoint.

#### Q: "Symlink escape detected (HTTP 403)"
- **Cause**: An attempted file operation points to a symlink whose target is outside the designated workspace root directory.
- **Fix**: RemoteIDE enforces strict jail containment. Ensure all project files reside inside the registered workspace root.

#### Q: "Concurrency conflict: ETag mismatch (HTTP 409)"
- **Cause**: The file was modified by an external tool (e.g. Git or local editor) while unsaved edits existed in the browser.
- **Fix**: RemoteIDE displays a conflict dialog allowing you to compare diffs, reload the disk version, or force overwrite.

## Contributing Guidelines

We welcome contributions from the community!

### Workflow
1. **Fork & Clone**: Fork the repository on GitHub and clone locally:
   ```bash
   git clone https://github.com/your-username/RemoteIDE.git
   cd RemoteIDE
   ```
2. **Create a Feature Branch**:
   ```bash
   git checkout -b feat/your-feature-name
   ```
3. **Install Dependencies & Start Backing Services**:
   ```bash
   pnpm install
   pnpm infra:up
   pnpm db:migrate
   ```
4. **Adhere to Code Standards**:
   - Write strict TypeScript with zero implicit `any`.
   - Validate external inputs with Zod schemas in `packages/shared`.
   - Never introduce shell command string concatenation; use argument arrays with `execFile`.
5. **Verify All Checks**:
   ```bash
   pnpm typecheck
   pnpm lint
   pnpm test
   ```
6. **Commit Messages**: Follow conventional commits (`feat:`, `fix:`, `docs:`, `perf:`). Keep the first line under 72 characters.
7. **Submit Pull Request**: Open a pull request against the `main` branch with a clear description of changes.

## Development Workflow

- **Adding a REST Endpoint**:
  1. Define Zod DTO schema in `packages/shared/src/contracts/`.
  2. Implement route handler in `apps/gateway/src/routes/`.
  3. Register route in `apps/gateway/src/app.ts`.
  4. Add automated test in `apps/gateway/test/`.
- **Updating Database Models**:
  1. Modify table definition in `packages/db/src/schema/`.
  2. Generate migration: `pnpm db:generate`.
  3. Apply migration: `pnpm db:migrate`.
- **Adding an Agent RPC Tool**:
  1. Add method name to `TunnelMessageType` in `packages/shared`.
  2. Implement handler in `apps/agent/src/routes/` or services.
  3. Wire RPC dispatcher in `apps/agent/src/server.ts`.

## Limitations & Known Issues

- **Browser Memory Limits on Massive Repositories**: Displaying file trees containing over 100,000 files in a single flat folder can cause browser DOM lag. Use `.gitignore` to omit `node_modules` and build directories.
- **Single Host per Workspace**: A workspace is physically bound to one host machine at a time; cross-host distributed clustering is not supported.

## License

This repository does not currently have an open-source license file committed to root. All rights reserved by the project authors.

## Contact & Support

- Email: `whilstsomebody@gmail.com`
- Discord: `https://discord.gg/fdzWdk8a`
- LinkedIn: `https://www.linkedin.com/in/aman-vishwakarma-3b788828a/`
