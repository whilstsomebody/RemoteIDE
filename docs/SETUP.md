# RemoteIDE — Setup and Developer Guide

This guide describes how to configure, run, and develop **RemoteIDE** locally.

---

## 1. Prerequisites

- **Node.js**: `v22.13+` or `v24+` (required for `node:sqlite`) (verified on Node.js `v24.19.0`)
- **pnpm**: `v10+` or `v12+` (verified on pnpm `12.18.0`)
- **Docker & Docker Compose**: For local PostgreSQL, Redis, and Kafka (KRaft mode)

---

## 2. Installation

Clone the repository and install all workspace dependencies from the root directory:

```bash
# Install all dependencies across all packages and apps
pnpm install
```

---

## 3. Environment Configuration

Copy the example environment files for the monorepo root and each service:

```bash
# Root environment
cp .env.example .env

# Service-specific environments
cp apps/gateway/.env.example apps/gateway/.env
cp apps/agent/.env.example apps/agent/.env
cp apps/worker/.env.example apps/worker/.env
cp apps/web/.env.example apps/web/.env
```

_Note: All `.env.example` templates contain safe local development defaults with no real credentials or production secrets._

---

## 4. Local Infrastructure (PostgreSQL, Redis, Kafka)

Start the local backing services using Docker Compose:

```bash
# Start PostgreSQL (5432), Redis (6379), and Kafka KRaft (9092)
pnpm infra:up

# Check container status
docker compose -f infra/docker-compose.yml ps

# View container logs
pnpm infra:logs

# Stop containers
pnpm infra:down
```

---

## 5. Database Schema & Migrations

Drizzle ORM manages the PostgreSQL schema:

```bash
# Generate SQL migrations from schema
pnpm db:generate

# Apply pending migrations to the local PostgreSQL database
pnpm db:migrate

# Push schema changes directly during rapid local prototyping
pnpm db:push
```

---

## 6. Running Applications in Development

Run all applications concurrently or start individual services:

```bash
# Run all services (web, gateway, agent, worker) concurrently with Turbo
pnpm dev

# Or run individual services:
pnpm --filter @remote-ide/gateway dev  # Runs Fastify Gateway on http://localhost:4000
pnpm --filter @remote-ide/agent dev    # Runs Host Agent on http://localhost:4001
pnpm --filter @remote-ide/worker dev   # Runs Background Worker
pnpm --filter @remote-ide/web dev      # Runs Next.js Web Shell on http://localhost:3000
```

---

## 7. Verification: Type Checking, Linting, & Tests

```bash
# Run strict TypeScript verification across all packages and apps
pnpm typecheck

# Run unit and integration tests across the monorepo with Vitest
pnpm test

# Run Playwright browser E2E tests for the Web Shell
pnpm test:e2e

# Check code formatting with Prettier
pnpm format:check

# Format code with Prettier
pnpm format

# Build all packages and applications for production
pnpm build
```

---

## 8. Service Endpoints Quick Reference

| Service           | Protocol | URL                                         | Description                               |
| ----------------- | -------- | ------------------------------------------- | ----------------------------------------- |
| Web Shell         | HTTP     | `http://localhost:3000`                     | Responsive dark IDE frontend interface    |
| Gateway REST      | HTTP     | `http://localhost:4000/api/v1`              | Ingress REST API root                     |
| Gateway Health    | HTTP     | `http://localhost:4000/health`              | Gateway health status check               |
| Gateway WS        | WS       | `ws://localhost:4000/api/v1/ws`             | Real-time WebSocket connection            |
| Host Agent Health | HTTP     | `http://localhost:4001/health`              | Local host agent health & journal status  |
| Host Capabilities | HTTP     | `http://localhost:4001/api/v1/capabilities` | Host OS, limits, and runtime capabilities |
