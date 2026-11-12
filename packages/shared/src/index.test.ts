import { describe, it, expect } from "vitest";
import {
  ErrorCode,
  AppError,
  createSuccessResponse,
  createErrorResponse,
  createWsMessage,
  WsMessageType,
  WS_PROTOCOL_VERSION,
  hasPermission,
  Permission,
  generateId,
  generateRequestId,
  generateCorrelationId,
  formatStructuredLog,
  GatewayEnvSchema,
  parseEnv,
} from "./index.js";

describe("@remote-ide/shared", () => {
  describe("AppError and Envelopes", () => {
    it("creates an AppError with code and status", () => {
      const err = new AppError(ErrorCode.FORBIDDEN, "Access denied");
      expect(err.code).toBe(ErrorCode.FORBIDDEN);
      expect(err.statusCode).toBe(403);
      expect(err.message).toBe("Access denied");
    });

    it("formats success and error API envelopes", () => {
      const success = createSuccessResponse({ key: "value" }, { requestId: "req-1" });
      expect(success.success).toBe(true);
      expect(success.data).toEqual({ key: "value" });
      expect(success.meta?.requestId).toBe("req-1");

      const error = createErrorResponse(ErrorCode.NOT_FOUND, "Not found", { requestId: "req-2" });
      expect(error.success).toBe(false);
      expect(error.error.code).toBe(ErrorCode.NOT_FOUND);
      expect(error.error.requestId).toBe("req-2");
    });
  });

  describe("WebSocket envelopes", () => {
    it("constructs standard WS envelope with version and type", () => {
      const msg = createWsMessage(WsMessageType.PING, { ping: true }, { correlationId: "corr-1" });
      expect(msg.version).toBe(WS_PROTOCOL_VERSION);
      expect(msg.type).toBe(WsMessageType.PING);
      expect(msg.correlationId).toBe("corr-1");
      expect(msg.payload).toEqual({ ping: true });
    });
  });

  describe("Capabilities and Permissions", () => {
    it("evaluates permission checks correctly", () => {
      const perms = [Permission.FS_READ, Permission.TERMINAL_READ];
      expect(hasPermission(Permission.FS_READ, perms)).toBe(true);
      expect(hasPermission(Permission.FS_WRITE, perms)).toBe(false);
    });
  });

  describe("IDs and Logging", () => {
    it("generates request and correlation IDs with prefix", () => {
      const reqId = generateRequestId();
      const corrId = generateCorrelationId();
      expect(reqId.startsWith("req_")).toBe(true);
      expect(corrId.startsWith("corr_")).toBe(true);
    });

    it("formats JSON structured logs", () => {
      const logStr = formatStructuredLog("info", "test log", { requestId: "req_123" });
      const parsed = JSON.parse(logStr);
      expect(parsed.level).toBe("info");
      expect(parsed.message).toBe("test log");
      expect(parsed.context.requestId).toBe("req_123");
    });
  });

  describe("Config validation", () => {
    it("parses valid env with defaults", () => {
      const parsed = parseEnv(GatewayEnvSchema, {
        PORT: "5000",
        JWT_SECRET: "1234567890123456",
      });
      expect(parsed.PORT).toBe(5000);
      expect(parsed.NODE_ENV).toBe("development");
    });
  });
});

