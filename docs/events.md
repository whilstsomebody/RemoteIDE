# RemoteIDE Events and Messaging Dictionary

RemoteIDE uses a dual-layer messaging architecture:
1. **Redis Pub/Sub**: Low-latency, ephemeral signaling (presence, active cursors, live notifications).
2. **Apache Kafka**: Durable, partitioned, persistent event stream (audit trails, outbox events, changelog history).

---

## 1. Kafka Event Topics

All Kafka events are serialized as JSON and conform to `DurableEvent<T>` with a partition key of `workspaceId`.

### Topic: `remoteide.workspace.events`
Authoritative sequence of workspace state mutations with monotonically increasing revisions.

#### `file.created`
- **Partition Key**: `workspaceId`
- **Payload**:
  ```json
  {
    "path": "src/utils.ts",
    "size": 512,
    "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  }
  ```

#### `file.modified`
- **Partition Key**: `workspaceId`
- **Payload**:
  ```json
  {
    "path": "src/app.ts",
    "size": 1048,
    "diffSummary": { "addedLines": 5, "removedLines": 2 }
  }
  ```

#### `file.deleted`
- **Partition Key**: `workspaceId`
- **Payload**:
  ```json
  {
    "path": "legacy.js"
  }
  ```

#### `git.committed`
- **Partition Key**: `workspaceId`
- **Payload**:
  ```json
  {
    "commitHash": "9f83abc...",
    "message": "fix: update dependency versions",
    "author": "developer@company.com"
  }
  ```

---

### Topic: `remoteide.audit.events`
Immutable security and audit trail consumed by compliance sinks.

#### `auth.login`
- **Partition Key**: `userId`
- **Payload**:
  ```json
  {
    "userId": "usr-123",
    "ipAddress": "192.168.1.50",
    "userAgent": "Mozilla/5.0 ...",
    "mfaUsed": true
  }
  ```

#### `share.created`
- **Partition Key**: `workspaceId`
- **Payload**:
  ```json
  {
    "linkId": "lnk-456",
    "role": "viewer",
    "expiresAt": "2026-11-25T00:00:00.000Z",
    "createdBy": "usr-123"
  }
  ```

---

## 2. Redis Pub/Sub Channels

Redis channels coordinate real-time presence and low-latency notifications across multiple Gateway instances.

### `workspace:{workspaceId}:presence`
Announces device heartbeat, online, and offline states.
```json
{
  "deviceId": "phone-b",
  "userId": "usr-123",
  "state": "active",
  "lastSeenAt": "2026-11-23T18:30:00.000Z"
}
```

### `workspace:{workspaceId}:collab`
Coordinates Yjs room events, follower mode updates, and editor join/leave notifications.

### `workspace:{workspaceId}:terminal:broadcast`
Notifies observers when a terminal session is resized or closed.
