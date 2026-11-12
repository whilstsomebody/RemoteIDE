# ADR 0001: Monorepo Structure and Core Technology Stack

## Status

Accepted

## Context

RemoteIDE requires a cohesive architecture spanning:

- A responsive, low-latency web frontend accessible on tablets, phones, and laptops.
- A central ingress gateway managing HTTP requests and multiplexed WebSocket connections.
- A lightweight, durable host agent daemon running on the developer's workstation.
- A background worker handling event streams and asynchronous operations.
- Shared domain models, contracts, and database access logic.

We needed a toolchain and architectural structure that enforces strict type safety, prevents code duplication, and allows independent development and deployment of components.

## Decisions

1. **Monorepo Tooling: pnpm Workspaces & Turborepo**:
   - `pnpm` provides fast, disk-efficient package management with strict dependency isolation.
   - `Turborepo` enables intelligent build caching, pipeline orchestration, and task parallelization.

2. **Frontend: Next.js 15 App Router & Tailwind CSS**:
   - Next.js 15 provides modern React 19 capabilities, fast builds, and edge routing.
   - Tailwind CSS provides clean, responsive, dark-mode-first IDE styling without CSS bloat.
   - Pure UI component primitives encapsulated in `@remote-ide/ui`.

3. **Gateway: Fastify with REST and WebSocket Plugins**:
   - Fastify provides high-throughput, low-overhead HTTP handling and built-in schema compilation.
   - `@fastify/websocket` multiplexes bi-directional RPC and streaming on a unified port.
   - Centralized error handling converts all internal errors to standardized `ApiErrorEnvelope` structures.

4. **Host Agent: Node.js Daemon with Native `node:sqlite` Journal**:
   - The host agent acts as the authority for filesystem operations, terminals, and processes.
   - Node.js 24 provides built-in synchronous SQLite (`node:sqlite`), giving the agent a durable local operation log with zero native C++ compile dependencies.

5. **Storage and Messaging**:
   - **PostgreSQL 16** with **Drizzle ORM** for type-safe relational persistence and schema migrations.
   - **Redis 7** for fast token session caching, rate limiting, and ephemeral pub/sub.
   - **Apache Kafka 3.8 in KRaft mode** for durable, high-throughput domain event streaming without the operational complexity of ZooKeeper.

6. **Contract Definition & Strict Typing**:
   - All external network payloads (HTTP and WebSocket) are defined as Zod schemas in `@remote-ide/shared`.
   - Every request and event carries a unique `requestId` or `correlationId`.

## Consequences

- Single language (TypeScript) and uniform toolchain across client, gateway, agent, and worker.
- Monorepo enforces shared contracts across client and server boundaries.
- No third-party native addon build failures for SQLite on developer machines.
