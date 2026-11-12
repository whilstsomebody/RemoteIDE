import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../src/app.js";
import { FastifyInstance } from "fastify";

describe("Gateway HTTP & WebSocket Service", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /health returns healthy status with standard envelope", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("healthy");
    expect(body.data.service).toBe("@remote-ide/gateway");
    expect(body.meta.timestamp).toBeDefined();
    expect(response.headers["x-request-id"]).toBeDefined();
    expect(response.headers["x-correlation-id"]).toBeDefined();
  });

  it("GET /api/v1/health returns healthy status", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/health",
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("healthy");
  });

  it("GET /api/v1 returns API root metadata", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1",
      headers: {
        "x-request-id": "custom-req-123",
        "x-correlation-id": "custom-corr-456",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.version).toBe("v1");
    expect(body.meta.requestId).toBe("custom-req-123");
    expect(response.headers["x-request-id"]).toBe("custom-req-123");
    expect(response.headers["x-correlation-id"]).toBe("custom-corr-456");
  });

  it("GET unknown endpoint returns 404 in standard error envelope", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/non-existent-route",
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.requestId).toBeDefined();
  });
});

