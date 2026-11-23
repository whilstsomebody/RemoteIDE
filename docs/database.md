# RemoteIDE Database Schema & Persistence Architecture

RemoteIDE utilizes a hybrid persistence architecture:
1. **PostgreSQL 16**: Central relational database in the control plane for persistent user accounts, workspace registrations, session security tokens, audit records, and AI conversations. Managed via **Drizzle ORM**.
2. **SQLite 3 WAL Journal**: Local embedded database on each Host Agent and Gateway instance for zero-latency outbox queuing, offline operations, and local state durability.

---

## 1. PostgreSQL Schema (`packages/db`)

### `users`
User identity, authentication hashes, and Multi-Factor Authentication state.
```sql
CREATE TABLE users (
  id VARCHAR(64) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'developer',
  mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  mfa_secret VARCHAR(255),
  mfa_backup_codes JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
```

### `workspaces`
Registered projects and their host association.
```sql
CREATE TABLE workspaces (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  host_id VARCHAR(64) NOT NULL,
  owner_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  root_path TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
```

### `sessions`
Active and revoked user sessions with indexed token lookups.
```sql
CREATE TABLE sessions (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  role VARCHAR(32) NOT NULL,
  device_name VARCHAR(128),
  ip_address VARCHAR(45),
  user_agent TEXT,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  revoked_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
```

### `workspace_events`
Immutable historical event stream.
```sql
CREATE TABLE workspace_events (
  id VARCHAR(64) PRIMARY KEY,
  workspace_id VARCHAR(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  host_id VARCHAR(64) NOT NULL,
  revision BIGINT NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  actor_id VARCHAR(64) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Performance Index for fast catch-up and revision range queries
CREATE INDEX idx_workspace_events_ws_rev ON workspace_events(workspace_id, revision);
```

### `outbox_events`
Transactional outbox pattern implementation for durable Kafka delivery.
```sql
CREATE TABLE outbox_events (
  id VARCHAR(64) PRIMARY KEY,
  topic VARCHAR(128) NOT NULL,
  partition_key VARCHAR(128) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  retry_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  published_at TIMESTAMP WITH TIME ZONE
);

-- Composite index for fast pending event polling
CREATE INDEX idx_outbox_events_status_created ON outbox_events(status, created_at);
```

### `ai_conversations` & `ai_messages`
Encrypted conversation history for the Gemini AI assistant.
```sql
CREATE TABLE ai_conversations (
  id VARCHAR(64) PRIMARY KEY,
  workspace_id VARCHAR(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_conv_ws_user ON ai_conversations(workspace_id, user_id);

CREATE TABLE ai_messages (
  id VARCHAR(64) PRIMARY KEY,
  conversation_id VARCHAR(64) NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role VARCHAR(32) NOT NULL, -- 'user' | 'assistant'
  content TEXT NOT NULL,
  attachments JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_messages_conv_id ON ai_messages(conversation_id);
```

---

## 2. SQLite Journal Format (Host Agent & Local WAL)

The Host Agent stores local outbox items, cursors, and uncommitted edits in `~/.remoteide/state.sqlite` using SQLite in **Write-Ahead Logging (WAL)** mode.

- **`journal_events`**: Stores mutations made offline or prior to tunnel acknowledgment.
- **`sync_cursors`**: Tracks the latest acknowledged revision from the Gateway.
- **`crdt_snapshots`**: Periodic compacted snapshots of Yjs collaborative documents.

---

## 3. Database Migrations

Migrations are managed with Drizzle Kit:

```bash
# Generate new migration files from schema changes
pnpm --filter @remote-ide/db generate

# Run pending migrations against PostgreSQL
pnpm --filter @remote-ide/db migrate
```
