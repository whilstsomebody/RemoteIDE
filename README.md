# RemoteIDE

Secure, local-first, browser-based remote development environment.

RemoteIDE enables developers to open projects located on their primary computer and securely access them from mobile devices, tablets, and remote laptops through authenticated, ephemeral links.

The host workstation retains exclusive authority over the filesystem, dev tools, compilers, language servers, terminals, and processes. Remote devices provide a reactive client interface to those resources.

---

## Architecture Overview

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

---

## Monorepo Layout

```
RemoteIDE/
├── apps/
│   ├── web/         # Next.js 15 App Router frontend (responsive dark IDE shell)
│   ├── gateway/     # Fastify HTTP and WebSocket gateway (/api/v1, /api/v1/ws)
│   ├── agent/       # Host background agent daemon (node:sqlite durable journal)
│   └── worker/      # Event processor and background job service
├── packages/
│   ├── shared/      # Shared Zod schemas, contracts, envelopes, capabilities
│   ├── db/          # PostgreSQL schema and Drizzle ORM migrations
│   ├── ui/          # Reusable UI component library (Tailwind CSS, shadcn style)
│   └── config/      # Shared TypeScript and linter presets
├── infra/           # Docker Compose (PostgreSQL 16, Redis 7, Kafka KRaft)
└── docs/            # Authoritative architecture, ADRs, and API specifications
```

---

## Quick Start

```bash
# 1. Install dependencies
pnpm install

# 2. Start local infrastructure (PostgreSQL, Redis, Kafka)
pnpm infra:up

# 3. Generate and run database migrations
pnpm db:generate
pnpm db:migrate

# 4. Start all applications
pnpm dev

# 5. Run tests & typecheck
pnpm test
pnpm typecheck
```

For full setup documentation, see [docs/SETUP.md](docs/SETUP.md) and [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md).
