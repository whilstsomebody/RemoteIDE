import { describe, it, expect, beforeEach } from "vitest";
import { buildApp } from "../src/app.js";
import { authService } from "../src/services/auth.service.js";
import { shareLinkService } from "../src/services/share-link.service.js";
import { UserRole, Permission, sha256Sync } from "@remote-ide/shared";

describe("Phase 3 - Temporary Share Links & Single-Use Redemption", () => {
  let ownerToken: string;

  beforeEach(async () => {
    (authService as any).users.clear();
    (authService as any).sessions.clear();
    (authService as any).tokenHashToSessionId.clear();
    (shareLinkService as any).links.clear();
    (shareLinkService as any).tokenHashToId.clear();

    const setupToken = authService.getSetupToken();
    const result = await authService.bootstrapOwner({
      email: "owner@test.com",
      password: "Password123!",
      displayName: "Owner",
      localSetupToken: setupToken,
      remoteIp: "127.0.0.1",
    });
    ownerToken = result.sessionToken;
  });

  it("creates a share link, stores only its SHA-256 hash, and redeems it once", async () => {
    const app = await buildApp({ logger: false });

    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/share-links",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        name: "Client Review Link",
        role: UserRole.VIEWER,
        expiresInSeconds: 3600,
        oneTimeRedemption: true,
        allowedWorkspaceIds: ["ws-123"],
      },
    });

    expect(createRes.statusCode).toBe(201);
    const createBody = JSON.parse(createRes.payload);
    expect(createBody.success).toBe(true);
    const { rawToken, shareLink } = createBody.data;
    expect(rawToken).toBeDefined();

    // Verify database/memory stores only the SHA-256 hash, NOT the raw token
    const storedLink = (shareLinkService as any).links.get(shareLink.id);
    expect(storedLink.tokenHash).toBe(sha256Sync(rawToken));
    expect((storedLink as any).rawToken).toBeUndefined();

    const redeemRes1 = await app.inject({
      method: "POST",
      url: "/api/v1/share-links/redeem",
      payload: {
        token: rawToken,
        deviceName: "Safari on iPad",
      },
    });

    expect(redeemRes1.statusCode).toBe(200);
    const redeemBody1 = JSON.parse(redeemRes1.payload);
    expect(redeemBody1.success).toBe(true);
    expect(redeemBody1.data.session.role).toBe(UserRole.VIEWER);
    expect(redeemBody1.data.session.capabilities).toContain(Permission.FS_READ);
    expect(redeemBody1.data.session.capabilities).not.toContain(Permission.FS_WRITE);
    expect(redeemBody1.data.session.allowedWorkspaceIds).toEqual(["ws-123"]);

    const redeemRes2 = await app.inject({
      method: "POST",
      url: "/api/v1/share-links/redeem",
      payload: {
        token: rawToken,
        deviceName: "Chrome on Mac",
      },
    });

    expect(redeemRes2.statusCode).toBe(410);
    const redeemBody2 = JSON.parse(redeemRes2.payload);
    expect(redeemBody2.error.message).toContain("single-use");

    await app.close();
  });

  it("enforces PIN protection on protected share links", async () => {
    const app = await buildApp({ logger: false });

    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/share-links",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        name: "PIN Protected Link",
        role: UserRole.EDITOR,
        expiresInSeconds: 3600,
        oneTimeRedemption: false,
        pin: "8492",
      },
    });

    const { rawToken } = JSON.parse(createRes.payload).data;

    const noPinRes = await app.inject({
      method: "POST",
      url: "/api/v1/share-links/redeem",
      payload: { token: rawToken },
    });
    expect(noPinRes.statusCode).toBe(401);

    const wrongPinRes = await app.inject({
      method: "POST",
      url: "/api/v1/share-links/redeem",
      payload: { token: rawToken, pin: "0000" },
    });
    expect(wrongPinRes.statusCode).toBe(401);

    const correctPinRes = await app.inject({
      method: "POST",
      url: "/api/v1/share-links/redeem",
      payload: { token: rawToken, pin: "8492" },
    });
    expect(correctPinRes.statusCode).toBe(200);

    await app.close();
  });
  it("locks a PIN-protected link after repeated wrong PINs", () => {
    const { rawToken } = shareLinkService.createShareLink("owner", {
      name: "PIN Lockout",
      role: UserRole.VIEWER,
      allowedWorkspaceIds: [],
      expiresInSeconds: 3600,
      oneTimeRedemption: false,
      pin: "8492",
      maxConcurrentSessions: 10,
    });
    for (let i = 0; i < 5; i++) {
      expect(() => shareLinkService.redeemShareLink({ token: rawToken, pin: "0000" }, "203.0.113.9")).toThrow(/Invalid PIN/);
    }
    expect(() => shareLinkService.redeemShareLink({ token: rawToken, pin: "8492" }, "203.0.113.9")).toThrow(/locked/);
  });

  it("counts concurrent sessions per link and never delegates owner access", async () => {
    const app = await buildApp({ logger: false });
    try {
      const headers = { authorization: `Bearer ${ownerToken}` };
      const ownerGrant = await app.inject({ method: "POST", url: "/api/v1/share-links", headers, payload: { name: "Owner grant", role: UserRole.OWNER } });
      expect(ownerGrant.statusCode).toBe(403);
      const tokens: string[] = [];
      for (const name of ["Review A", "Review B"]) {
        const created = await app.inject({ method: "POST", url: "/api/v1/share-links", headers, payload: { name, role: UserRole.VIEWER, oneTimeRedemption: false, maxConcurrentSessions: 1 } });
        expect(created.statusCode).toBe(201);
        tokens.push(created.json().data.rawToken);
      }
      for (const token of tokens) {
        const redeemed = await app.inject({ method: "POST", url: "/api/v1/share-links/redeem", payload: { token } });
        expect(redeemed.statusCode).toBe(200);
      }
      const second = await app.inject({ method: "POST", url: "/api/v1/share-links/redeem", payload: { token: tokens[0] } });
      expect(second.statusCode).toBe(429);
    } finally { await app.close(); }
  });

});
