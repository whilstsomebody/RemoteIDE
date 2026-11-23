# Contributing to RemoteIDE

Thank you for contributing to RemoteIDE! This document outlines our monorepo architecture, development environment setup, coding guidelines, testing standards, and pull request workflow.

---

## 1. Monorepo Overview

RemoteIDE is organized as a pnpm workspace with strict package boundaries:

```
RemoteIDE/
├── apps/
│   ├── agent/       # Node.js Host Agent (runs on developer workstations)
│   ├── gateway/     # Fastify API Gateway, Tunnel Relay, & Auth server
│   ├── web/         # Next.js 14+ PWA frontend (React, Tailwind, CodeMirror)
│   └── worker/      # Event-driven background processor (Kafka consumer)
├── packages/
│   ├── shared/      # Shared TypeScript types, schemas, and security utils
│   ├── db/          # Drizzle ORM schemas, migrations, and PostgreSQL client
│   └── eslint-config/# Unified ESLint rules
├── infra/           # Docker Compose, Caddy configurations, and k8s specs
└── docs/            # Comprehensive documentation and guides
```

---

## 2. Setting Up Your Development Environment

### Prerequisites
- **Node.js**: >= 20.0.0
- **pnpm**: >= 9.0.0
- **Docker**: For local PostgreSQL, Redis, and Kafka

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/your-org/RemoteIDE.git
cd RemoteIDE

# Install dependencies across all workspace packages
pnpm install

# Start local infrastructure dependencies
pnpm infra:up

# Run database migrations
pnpm db:migrate

# Start development servers with live reload
pnpm dev
```

---

## 3. Running Verification and Tests

All pull requests must pass our automated verification pipeline:

```bash
# Type check all packages in the workspace
pnpm typecheck

# Lint all packages
pnpm lint

# Run all unit and integration test suites
pnpm test
```

---

## 4. Coding Conventions

- **TypeScript Strict Mode**: No implicit `any`, strict null checks enabled.
- **Validation**: Validate all external inputs (HTTP payloads, query parameters, WebSocket messages) using **Zod** schemas defined in `@remote-ide/shared`.
- **Security-First**:
  - Never concatenate user strings into shell commands. Use `execFile` with argument arrays.
  - Always validate file paths with `validateWorkspacePath` to prevent directory traversal.
  - Never log raw secrets, tokens, or private keys.
- **Commit Messages**: Follow standard conventional commits format with the title under 72 characters.
