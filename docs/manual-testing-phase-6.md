# Redis, Kafka, and Event-Driven Synchronization — Manual Testing Guide

This guide provides end-to-end instructions for testing and validating RemoteIDE's distributed event infrastructure, including Redis-backed caching and fan-out, Apache Kafka topic partitioning, PostgreSQL transactional outbox delivery, host agent SQLite journal replay, and multi-device live synchronization.

---

## Architecture Overview

```
 ┌───────────────────────────────────┐               ┌───────────────────────────────────┐
 │       Client Device A (Web)       │               │       Client Device B (Web)       │
 │  - Live WS subscription           │               │  - Live WS subscription           │
 │  - Real-time file & git updates   │               │  - Auto-reconcile on reconnect    │
 └─────────────────▲─────────────────┘               └─────────────────▲─────────────────┘
                   │ Authenticated WS                                  │ Authenticated WS
                   └─────────────────────────┬─────────────────────────┘
                                             ▼
 ┌───────────────────────────────────────────────────────────────────────────────────────┐
 │                                    Remote Gateway                                     │
 │  - Transactional Outbox Engine: Allocates authoritative, sequential revisions         │
 │  - Redis Service: Session/Presence/Routing/Revision/Permission cache + Pub/Sub fan-out│
 │  - Kafka Service: Topics (workspace/session/process/git/job/audit) partitioned by wsId│
 │  - Sync & Reconciliation Endpoint: /api/v1/sync/events & /api/v1/sync/reconcile       │
 └────────────────────────▲─────────────────────────▲────────────────────────────▲───────┘
                          │                         │                            │
             Outbound WS  │             Pub/Sub     │             Events         │
             Tunnel       │             Fan-out     │             Produce        │
                          ▼                         ▼                            ▼
 ┌─────────────────────────────────┐   ┌───────────────────────────┐   ┌─────────────────┐
 │        Local Host Agent         │   │       Redis 7 Stack       │   │   Apache Kafka  │
 │  - Filesystem watcher           │   │  - Session cache (1h TTL) │   │  - 8 versioned  │
 │  - Save loop suppression        │   │  - Presence (30s TTL)     │   │    topics       │
 │  - SQLite offline journal       │   │  - Rate limits & routing  │   │  - wsId ordered │
 │  - Background SyncClient        │   │  - Idempotency keys (24h) │   │    partitioning │
 └─────────────────────────────────┘   └───────────────────────────┘   └─────────────────┘
```

---

## 1. Prerequisites and Setup

1. **Start backing services** (optional, fallback in-memory mode runs automatically if offline):

   ```bash
   docker compose -f infra/docker-compose.yml up -d
   ```

2. **Build monorepo packages**:

   ```bash
   pnpm install
   pnpm build
   ```

3. **Start Gateway** (runs on port 4000):

   ```bash
   pnpm --filter @remote-ide/gateway dev
   ```

4. **Start Host Agent** (runs on port 4001, opens tunnel to Gateway):

   ```bash
   pnpm --filter @remote-ide/agent dev
   ```

5. **Start Web Interface** (runs on port 3000):
   ```bash
   pnpm --filter @remote-ide/web dev
   ```

---

## 2. Multi-Device Live Synchronization Verification

### Scenario: Device A modifies a file; Device B receives the update automatically

1. **Open Device A**:
   - Open `http://localhost:3000` in a Chrome window.
   - Open a workspace folder and note the connection indicator in the Status Bar (`connected`).

2. **Open Device B**:
   - Open `http://localhost:3000` in an Incognito window (or secondary browser).
   - Log in and open the same workspace.

3. **Execute change on Device A**:
   - On Device A, open `src/index.ts` or create a new file `notes.txt`.
   - Type some content and press `Cmd+S` (Save).

4. **Observe Device B**:
   - Without refreshing Device B, verify that Device B's file explorer displays `notes.txt` instantly.
   - Verify Device B's notification log displays:
     `Live sync: workspace.file.created (rev 1)`.

---

## 3. Filesystem Watcher & Save Loop Suppression Verification

### Scenario: External file modification vs. RemoteIDE internal save

1. **Test External File Change Detection**:
   - In your host terminal, execute:
     ```bash
     echo "export const external = true;" > apps/agent/src/test-external.ts
     ```
   - Observe:
     - The host agent's `WatcherService` detects the file modification on disk.
     - The change is logged into SQLite `file_change_journal`.
     - `SyncClientService` submits the event to Gateway `POST /api/v1/sync/events`.
     - Gateway allocates an authoritative revision and broadcasts the event.
     - Web IDE file tree automatically refreshes and displays `test-external.ts`.

2. **Test Save Loop Suppression**:
   - In RemoteIDE, edit `apps/agent/src/test-external.ts` and save it (`FilesystemService.writeFile`).
   - `FilesystemService` marks `test-external.ts` in `WatcherService.markInternalSave(...)`.
   - When the host filesystem watcher triggers on the file's mtime change, it recognizes the internal save mark and suppresses the event.
   - Confirm in the logs that no duplicate outbox event or endless synchronization loop occurs.

3. **Clean up**:
   ```bash
   rm apps/agent/src/test-external.ts
   ```

---

## 4. Disconnected Replay & Transactional Outbox Verification

### Scenario: Host agent goes offline, records changes locally, and replays upon reconnection

1. **Disconnect Host Agent**:
   - Stop the Host Agent process (`Ctrl+C`).
   - Create or modify a file locally while the agent is disconnected:
     ```bash
     echo "offline change" > test-offline.txt
     ```
   - Restart the Host Agent.
   - The agent's `LocalJournalService` maintains the pending SQLite entry with host sequence number `1`.

2. **Reconnect & Replay**:
   - The agent establishes connection to Gateway.
   - `SyncClientService` flushes the pending event batch to `/api/v1/sync/events`.
   - Gateway deduplicates against idempotency keys and assigns an authoritative workspace revision.
   - The pending journal entry in SQLite is updated to `status = 'delivered'`.
   - Web IDE receives the live sync broadcast.

---

## 5. Client Reconnection & Reconciliation Verification

### Scenario: Client loses network connection and reconciles missed events

1. **Simulate Missed Revisions**:
   - Query client reconciliation endpoint directly:
     ```bash
     curl "http://localhost:4000/api/v1/sync/reconcile?workspaceId=default&sinceRevision=0&limit=10"
     ```
   - Observe JSON response containing `currentRevision`, array of missed events, and `hasMore: false`.
2. When a web client reconnects after temporary network loss, it provides its `sinceRevision`, reconciles missed events in order, and updates its local file tree state.

---

## 6. Redis & Kafka Outage Recovery Verification

1. **Redis Fault Tolerance**:
   - If Redis is temporarily stopped or unreachable, Gateway and Worker automatically fall back to memory-backed cache and local pub/sub.
   - Sessions, presence, rate limits, and workspace revisions continue functioning without crashing.
   - When Redis restarts, connections resume seamlessly.

2. **Kafka Fault Tolerance**:
   - If Kafka brokers are temporarily stopped, events are durably retained in PostgreSQL `outbox_events` with status `pending`.
   - Once Kafka recovers, the Outbox Publisher flushes pending records to topics without dropping events.
   - If an event repeatedly fails, it is moved to Dead-Letter Queue status (`failed`) with error metadata after 5 retry attempts.

---

## 7. Operational Metrics Endpoint Verification

Check the event infrastructure metrics endpoint:

```bash
curl http://localhost:4000/api/v1/sync/metrics | jq .
```

Expected output:

```json
{
  "success": true,
  "data": {
    "redis": {
      "cacheHits": 42,
      "cacheMisses": 3,
      "hitRatio": 0.9333,
      "connected": false
    },
    "kafka": {
      "publishedCount": 15,
      "consumedCount": 15,
      "consumerLag": 0,
      "connected": false
    },
    "events": {
      "processingLatencyMs": 4,
      "outboxPendingCount": 0,
      "deadLetterCount": 0
    },
    "websockets": {
      "activeConnections": 2,
      "subscribedWorkspacesCount": 1
    }
  }
}
```
