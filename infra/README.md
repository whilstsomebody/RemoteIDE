# RemoteIDE Local Infrastructure

This directory contains container definitions and orchestration scripts for running local storage, messaging, and cache backing services.

## Services

| Service      | Image                | Port   | Description                                               |
| ------------ | -------------------- | ------ | --------------------------------------------------------- |
| PostgreSQL   | `postgres:16-alpine` | `5432` | Relational storage for users, sessions, hosts, audit logs |
| Redis        | `redis:7-alpine`     | `6379` | Ephemeral session cache, pub/sub, rate limiting           |
| Apache Kafka | `apache/kafka:3.8.0` | `9092` | Event streaming engine in KRaft mode (no ZooKeeper)       |

## Quick Start

```bash
# Start all infrastructure containers in the background
docker compose -f infra/docker-compose.yml up -d

# Check health and logs
docker compose -f infra/docker-compose.yml ps
docker compose -f infra/docker-compose.yml logs -f

# Stop all containers
docker compose -f infra/docker-compose.yml down
```
