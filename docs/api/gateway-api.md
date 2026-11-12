# RemoteIDE Gateway API Specification

Version: `1.0.0`  
Base URL Prefix: `/api/v1`

---

## 1. Architectural Overview & Envelopes

All HTTP endpoints return responses enclosed in standard JSON envelopes.

### Success Envelope

```typescript
interface ApiSuccessEnvelope<T> {
  success: true;
  data: T;
  meta?: {
    requestId?: string;
    correlationId?: string;
    timestamp: string;
    pagination?: {
      total: number;
      page: number;
      pageSize: number;
      hasMore: boolean;
    };
  };
}
```

### Error Envelope

```typescript
interface ApiErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Array<Record<string, unknown>>;
    requestId?: string;
    timestamp: string;
  };
}
```

---

## 2. HTTP REST Endpoints

### 2.1 System Health

- **`GET /health`** (or **`GET /api/v1/health`**)
  - Description: Returns the operational status, service identifier, uptime, memory metrics, and dependency health.
  - Authentication: None required.
  - Response `200 OK`:
    ```json
    {
      "success": true,
      "data": {
        "status": "healthy",
        "service": "@remote-ide/gateway",
        "version": "0.1.0",
        "uptimeSeconds": 142,
        "timestamp": "2026-11-12T21:00:00.000Z",
        "environment": "development",
        "components": {
          "memory": {
            "status": "healthy",
            "details": {
              "rssMb": 45,
              "heapUsedMb": 28
            }
          }
        }
      },
      "meta": {
        "requestId": "req_801934ba",
        "correlationId": "corr_129481ad",
        "timestamp": "2026-11-12T21:00:00.000Z"
      }
    }
    ```

### 2.2 API Information

- **`GET /api/v1`**
  - Description: Root metadata and discovery for API v1 endpoints.
  - Response `200 OK`:
    ```json
    {
      "success": true,
      "data": {
        "name": "RemoteIDE Gateway API",
        "version": "v1",
        "documentation": "/docs",
        "endpoints": {
          "health": "/api/v1/health",
          "websocket": "/api/v1/ws"
        }
      }
    }
    ```

---

## 3. WebSocket Real-Time Gateway

- **Endpoint**: `GET /api/v1/ws`
- **Protocol Version**: `1.0.0`

### 3.1 Standard Frame Format

Every frame transmitted across the WebSocket connection must adhere to the `WsEnvelope` specification:

```typescript
interface WsEnvelope<T = unknown> {
  version: "1.0.0";
  type: string;
  id: string; // Unique message ID
  correlationId?: string; // Correlated request ID
  timestamp: string; // ISO 8601
  payload: T;
}
```

### 3.2 Handshake Greeting

Upon connection, the server immediately sends a `connected` frame:

```json
{
  "version": "1.0.0",
  "type": "connected",
  "id": "msg_c9a184",
  "correlationId": "corr_9812ad",
  "timestamp": "2026-11-12T21:00:00.000Z",
  "payload": {
    "gatewayVersion": "0.1.0",
    "protocolVersion": "1.0.0",
    "sessionId": "req_108204"
  }
}
```

### 3.3 Heartbeat Ping/Pong

Clients send periodic `ping` frames:

```json
{
  "version": "1.0.0",
  "type": "ping",
  "id": "msg_123",
  "timestamp": "2026-11-12T21:00:15.000Z",
  "payload": {}
}
```

Server responds with `pong`:

```json
{
  "version": "1.0.0",
  "type": "pong",
  "id": "msg_124",
  "correlationId": "msg_123",
  "timestamp": "2026-11-12T21:00:15.005Z",
  "payload": {
    "received": "2026-11-12T21:00:15.000Z"
  }
}
```
