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
  generateRequestId,
  generateCorrelationId,
  formatStructuredLog,
  GatewayEnvSchema,
  parseEnv,
  WorkspaceSchema,
  FileNodeSchema,
  WriteFileDtoSchema,
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

  describe("Workspace and Filesystem Schemas", () => {
    it("validates Workspace schema", () => {
      const ws = WorkspaceSchema.parse({
        id: "ws-1",
        name: "Test Project",
        folders: [{ id: "f-1", name: "root", path: "/test" }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isActive: true,
      });
      expect(ws.name).toBe("Test Project");
    });

    it("validates recursive FileNode schema", () => {
      const node = FileNodeSchema.parse({
        name: "src",
        path: "src",
        type: "directory",
        children: [
          {
            name: "index.ts",
            path: "src/index.ts",
            type: "file",
            size: 100,
          },
        ],
      });
      expect(node.children?.length).toBe(1);
    });

    it("validates WriteFileDto schema with defaults", () => {
      const dto = WriteFileDtoSchema.parse({
        path: "readme.md",
        content: "# Hello",
      });
      expect(dto.encoding).toBe("utf-8");
      expect(dto.createParents).toBe(true);
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

  describe("Security, TOTP, and Circuit Breaker", () => {
    it("detects and blocks SSRF dangerous targets", async () => {
      const { isSsrfDangerousTarget } = await import("./utils/security.js");
      expect(isSsrfDangerousTarget("http://169.254.169.254/latest/meta-data").blocked).toBe(true);
      expect(isSsrfDangerousTarget("http://metadata.google.internal/computeMetadata/v1").blocked).toBe(true);
      expect(isSsrfDangerousTarget("http://100.100.100.200/latest/meta-data").blocked).toBe(true);
      expect(isSsrfDangerousTarget("http://169.254.10.20/api").blocked).toBe(true);
      expect(isSsrfDangerousTarget("http://224.0.0.1/").blocked).toBe(true);
      expect(isSsrfDangerousTarget("http://localhost:3000/").blocked).toBe(false);
      expect(isSsrfDangerousTarget("https://api.github.com/").blocked).toBe(false);
    });

    it("generates and verifies RFC 6238 TOTP codes and backup codes", async () => {
      const {
        generateTotpSecret,
        generateTotpCode,
        verifyTotpCode,
        generateBackupCodes,
        hashBackupCode,
        verifyAndConsumeBackupCode,
      } = await import("./utils/totp.js");

      const secret = generateTotpSecret();
      expect(secret.length).toBeGreaterThan(16);

      const code = generateTotpCode(secret);
      expect(code).toMatch(/^\d{6}$/);

      const isValid = verifyTotpCode(code, secret);
      expect(isValid).toBe(true);

      const isInvalid = verifyTotpCode("000000", secret);
      expect(isInvalid).toBe(false);

      const backupCodes = generateBackupCodes(4);
      expect(backupCodes.length).toBe(4);
      const hashed = backupCodes.map(hashBackupCode);

      const consumed = verifyAndConsumeBackupCode(backupCodes[0]!, hashed);
      expect(consumed.valid).toBe(true);
      expect(consumed.remainingHashedCodes.length).toBe(3);

      const doubleConsumed = verifyAndConsumeBackupCode(backupCodes[0]!, consumed.remainingHashedCodes);
      expect(doubleConsumed.valid).toBe(false);
    });

    it("trips circuit breaker on repeated failures and recovers", async () => {
      const { CircuitBreaker } = await import("./utils/circuit-breaker.js");
      const cb = new CircuitBreaker({ failureThreshold: 3, recoveryTimeoutMs: 50, halfOpenSuccessThreshold: 1 });

      expect(cb.getState()).toBe("CLOSED");

      const failAction = async () => {
        throw new Error("Downstream failure");
      };

      await expect(cb.execute(failAction)).rejects.toThrow("Downstream failure");
      await expect(cb.execute(failAction)).rejects.toThrow("Downstream failure");
      expect(cb.getState()).toBe("CLOSED");

      await expect(cb.execute(failAction)).rejects.toThrow("Downstream failure");
      expect(cb.getState()).toBe("OPEN");

      // Should fail fast with 503
      await expect(cb.execute(failAction)).rejects.toThrow("Circuit breaker");

      // Wait for recovery timeout
      await new Promise((r) => setTimeout(r, 60));
      expect(cb.getState()).toBe("HALF_OPEN");

      // Successful call resets to CLOSED
      const res = await cb.execute(async () => "recovered");
      expect(res).toBe("recovered");
      expect(cb.getState()).toBe("CLOSED");
    });
  });
});
