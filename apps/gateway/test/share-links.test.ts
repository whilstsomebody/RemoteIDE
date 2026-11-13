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

    // Bootstrap an owner
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

    // 1. Create a single-use Viewer link
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

    // 2. First redemption succeeds and creates a session
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

    // 3. Second redemption of single-use link fails with 410
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

    // 1. Create a link with PIN "8492"
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

    // 2. Redeem without PIN -> fails
    const noPinRes = await app.inject({
      method: "POST",
      url: "/api/v1/share-links/redeem",
      payload: { token: rawToken },
    });
    expect(noPinRes.statusCode).toBe(401);

    // 3. Redeem with wrong PIN -> fails
    const wrongPinRes = await app.inject({
      method: "POST",
      url: "/api/v1/share-links/redeem",
      payload: { token: rawToken, pin: "0000" },
    });
    expect(wrongPinRes.statusCode).toBe(401);

    // 4. Redeem with correct PIN -> succeeds
    const correctPinRes = await app.inject({
      method: "POST",
      url: "/api/v1/share-links/redeem",
      payload: { token: rawToken, pin: "8492" },
    });
    expect(correctPinRes.statusCode).toBe(200);

    await app.close();
  });
});

