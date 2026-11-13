import { describe, it, expect, beforeEach } from "vitest";
import { buildApp } from "../src/app.js";
import { authService } from "../src/services/auth.service.js";

describe("Phase 3 - Owner Authentication & Local Setup Flow", () => {
  beforeEach(() => {
    // Reset service state
    (authService as any).users.clear();
    (authService as any).sessions.clear();
    (authService as any).tokenHashToSessionId.clear();
    (authService as any).failedAttempts.clear();
  });

  it("permits owner initialization only via trusted loopback interface", async () => {
    const app = await buildApp({ logger: false });
    const setupToken = authService.getSetupToken();

    // 1. Attempt bootstrap from remote IP (should fail with 403)
    const remoteRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/bootstrap",
      remoteAddress: "192.168.1.100", // Non-loopback
      payload: {
        email: "owner@remoteide.com",
        password: "SuperSecurePassword123!",
        displayName: "Remote Owner",
        localSetupToken: setupToken,
      },
    });

    expect(remoteRes.statusCode).toBe(403);
    const remoteBody = JSON.parse(remoteRes.payload);
    expect(remoteBody.success).toBe(false);
    expect(remoteBody.error.message).toContain("loopback");

    // 2. Bootstrap from loopback (127.0.0.1) with correct token (should succeed)
    const localRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/bootstrap",
      remoteAddress: "127.0.0.1",
      payload: {
        email: "owner@remoteide.com",
        password: "SuperSecurePassword123!",
        displayName: "Remote Owner",
        localSetupToken: setupToken,
      },
    });

    expect(localRes.statusCode).toBe(200);
    const localBody = JSON.parse(localRes.payload);
    expect(localBody.success).toBe(true);
    expect(localBody.data.user.isOwner).toBe(true);
    expect(localBody.data.sessionToken).toBeDefined();

    // 3. Second bootstrap attempt is rejected with 409
    const secondRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/bootstrap",
      remoteAddress: "127.0.0.1",
      payload: {
        email: "another@remoteide.com",
        password: "SuperSecurePassword123!",
        displayName: "Another Owner",
        localSetupToken: setupToken,
      },
    });

    expect(secondRes.statusCode).toBe(409);
    await app.close();
  });

  it("authenticates password with rate limiting against brute-force attacks", async () => {
    const app = await buildApp({ logger: false });
    const setupToken = authService.getSetupToken();

    // Setup owner
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/bootstrap",
      remoteAddress: "127.0.0.1",
      payload: {
        email: "owner@remoteide.com",
        password: "CorrectPassword123!",
        displayName: "Owner",
        localSetupToken: setupToken,
      },
    });

    // 4 failed attempts
    for (let i = 0; i < 4; i++) {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        remoteAddress: "10.0.0.5",
        payload: {
          email: "owner@remoteide.com",
          password: `WrongPassword_${i}`,
        },
      });
      expect(res.statusCode).toBe(401);
    }

    // 5th failed attempt -> locks account
    const fifthRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      remoteAddress: "10.0.0.5",
      payload: {
        email: "owner@remoteide.com",
        password: "WrongPassword_5",
      },
    });
    expect(fifthRes.statusCode).toBe(401);

    // 6th attempt (even with correct password) is locked out with 429
    const lockedRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      remoteAddress: "10.0.0.5",
      payload: {
        email: "owner@remoteide.com",
        password: "CorrectPassword123!",
      },
    });
    expect(lockedRes.statusCode).toBe(429);
    const lockedBody = JSON.parse(lockedRes.payload);
    expect(lockedBody.error.message).toContain("locked");

    await app.close();
  });
});

