# RemoteIDE Production Deployment Guide

This guide details the single-server production deployment of RemoteIDE using Docker Compose, Caddy for automated TLS termination, and secure internal container networking.

---

## 1. Production Architecture Topology

```mermaid
flowchart TB
    Internet([Public Internet]) -->|HTTPS / WSS on 443| Caddy[Caddy Reverse Proxy]
    Caddy -->|HTTP :3001| Gateway[API Gateway]
    Caddy -->|HTTP :3000| Web[Web PWA]
    Gateway --> Worker[Background Worker]
    Gateway & Worker -->|Private Network| PG[(PostgreSQL)]
    Gateway & Worker -->|Private Network| Redis[(Redis)]
    Gateway & Worker -->|Private Network| Kafka[(Kafka)]
```

> **Security Rule**: PostgreSQL (`5432`), Redis (`6379`), and Kafka (`9092`) are **never published** to the host interface or public internet. They communicate strictly over the internal Docker network `remoteide-internal`.

---

## 2. Server Preparation

A standard Linux server (Ubuntu 22.04 LTS or Debian 12) with at least 2 vCPUs and 4GB RAM is recommended.

```bash
# Update and install Docker + Compose plugin
sudo apt update && sudo apt install -y curl git
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

---

## 3. Deployment Configuration

### Step 1: Clone Repository
```bash
git clone https://github.com/your-org/RemoteIDE.git /opt/remoteide
cd /opt/remoteide
```

### Step 2: Configure Environment Variables
Copy and configure the production environment file:

```bash
cp infra/.env.example infra/.env
```

Edit `infra/.env`:
```ini
# Domain configuration
DOMAIN=ide.yourdomain.com

# PostgreSQL Credentials
POSTGRES_DB=remoteide
POSTGRES_USER=remoteide
POSTGRES_PASSWORD=generate_a_long_random_password_here
DATABASE_URL=postgres://remoteide:${POSTGRES_PASSWORD}@postgres:5432/remoteide

# Redis & Kafka
REDIS_URL=redis://redis:6379
KAFKA_BROKERS=kafka:9092

# Secrets (Generate via `openssl rand -hex 32`)
JWT_SECRET=generate_random_32_byte_hex_here
SETUP_TOKEN=generate_secure_bootstrap_token_here
ENCRYPTION_KEY=generate_32_byte_aes_key_here
```

### Step 3: Configure Caddy (`infra/caddy/Caddyfile`)
```caddy
{$DOMAIN:localhost} {
    encode gzip zstd

    # Security Headers
    header {
        Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "strict-origin-when-cross-origin"
    }

    # API Gateway & WebSockets
    handle /api/* {
        reverse_proxy gateway:3001
    }
    handle /ws/* {
        reverse_proxy gateway:3001
    }
    handle /health* {
        reverse_proxy gateway:3001
    }
    handle /metrics {
        reverse_proxy gateway:3001
    }

    # Frontend Web App
    handle {
        reverse_proxy web:3000
    }
}
```

---

## 4. Starting the Application Stack

```bash
cd infra
docker compose -f docker-compose.prod.yml up -d --build
```

### Checking Services Status
```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f gateway
```

---

## 5. Multi-Node Scaling & High Availability

For enterprise workloads:
1. **Stateless Gateways**: The Gateway maintains no local persistent state (session data is in Redis/PostgreSQL). Deploy multiple gateway instances behind an AWS ALB or Cloudflare Load Balancer.
2. **Managed Datastores**: Replace the dockerized PostgreSQL, Redis, and Kafka services with AWS RDS for PostgreSQL, AWS ElastiCache for Redis, and Amazon MSK (Managed Streaming for Kafka).
3. **Session Affinity**: WebSockets (`/ws/*`) benefit from sticky sessions to prevent unnecessary tunnel re-handshakes during rolling updates.
