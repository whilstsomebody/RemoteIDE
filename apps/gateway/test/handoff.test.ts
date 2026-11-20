import { describe, it, expect } from "vitest";
import { buildApp } from "../src/app.js";
import { authService } from "../src/services/auth.service.js";
import { UserRole, ROLE_PERMISSIONS } from "@remote-ide/shared";

describe("Phase 10 — Cross-Device Handoff & Continuity", () => {
  it("stages workspace handoff, lists active devices, and consumes handoff on target device", async () => {
    const app = await buildApp({ logger: false });

    // 1. Create desktop session for user
    const { sessionToken: desktopToken, session: desktopSession } = authService.createSessionInternal({
      userId: "user-continuity-1",
      hostId: "local-host-agent",
      role: UserRole.OWNER,
      capabilities: ROLE_PERMISSIONS[UserRole.OWNER],
      allowedWorkspaceIds: [],
      deviceName: "MacBook Pro",
      ipAddress: "192.168.1.50",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      isOwner: true,
      durationSeconds: 3600,
    });

    // 2. Create mobile phone session for same user
    const { sessionToken: mobileToken, session: mobileSession } = authService.createSessionInternal({
      userId: "user-continuity-1",
      hostId: "local-host-agent",
      role: UserRole.OWNER,
      capabilities: ROLE_PERMISSIONS[UserRole.OWNER],
      allowedWorkspaceIds: [],
      deviceName: "iPhone 15 Pro",
      ipAddress: "192.168.1.80",
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      isOwner: true,
      durationSeconds: 3600,
    });

    // 3. List active devices from desktop session
    const devicesRes = await app.inject({
      method: "GET",
      url: "/api/v1/devices/active",
      headers: { authorization: `Bearer ${desktopToken}` },
    });
    expect(devicesRes.statusCode).toBe(200);
    const devicesBody = JSON.parse(devicesRes.body);
    expect(devicesBody.success).toBe(true);
    expect(devicesBody.data.length).toBeGreaterThanOrEqual(2);

    const desktopDev = devicesBody.data.find((d: any) => d.id === desktopSession.id);
    expect(desktopDev).toBeDefined();
    expect(desktopDev.type).toBe("desktop");
    expect(desktopDev.isCurrent).toBe(true);

    const phoneDev = devicesBody.data.find((d: any) => d.id === mobileSession.id);
    expect(phoneDev).toBeDefined();
    expect(phoneDev.type).toBe("phone");
    expect(phoneDev.isCurrent).toBe(false);

    // 4. Desktop stages handoff targeted to phone
    const stageRes = await app.inject({
      method: "POST",
      url: "/api/v1/handoff",
      headers: { authorization: `Bearer ${desktopToken}` },
      payload: {
        targetDeviceId: mobileSession.id,
        layout: {
          activeWorkspaceId: "ws-1",
          workspaceName: "RemoteIDE Core",
          openFilePaths: ["src/index.ts", "README.md"],
          activeFilePath: "src/index.ts",
          cursorPosition: { line: 42, col: 10 },
          activeTab: "editor",
          isSplit: false,
          terminalSessionIds: ["term-1"],
        },
      },
    });
    expect(stageRes.statusCode).toBe(201);
    const stageBody = JSON.parse(stageRes.body);
    expect(stageBody.success).toBe(true);
    const handoffId = stageBody.data.id;
    expect(handoffId).toBeDefined();
    expect(stageBody.data.layout.activeFilePath).toBe("src/index.ts");
    expect(stageBody.data.layout.cursorPosition.line).toBe(42);

    // 5. Phone checks pending handoff
    const pendingRes = await app.inject({
      method: "GET",
      url: `/api/v1/handoff/pending?deviceId=${mobileSession.id}`,
      headers: { authorization: `Bearer ${mobileToken}` },
    });
    expect(pendingRes.statusCode).toBe(200);
    const pendingBody = JSON.parse(pendingRes.body);
    expect(pendingBody.success).toBe(true);
    expect(pendingBody.data).toBeDefined();
    expect(pendingBody.data.id).toBe(handoffId);
    expect(pendingBody.data.sourceDeviceName).toBe("MacBook Pro");

    // 6. Phone accepts/consumes handoff
    const consumeRes = await app.inject({
      method: "POST",
      url: `/api/v1/handoff/${handoffId}/consume`,
      headers: { authorization: `Bearer ${mobileToken}` },
    });
    expect(consumeRes.statusCode).toBe(200);
    const consumeBody = JSON.parse(consumeRes.body);
    expect(consumeBody.success).toBe(true);
    expect(consumeBody.data.layout.openFilePaths).toContain("src/index.ts");

    // 7. Verify one-time consumption (subsequent consume fails with 404)
    const secondConsume = await app.inject({
      method: "POST",
      url: `/api/v1/handoff/${handoffId}/consume`,
      headers: { authorization: `Bearer ${mobileToken}` },
    });
    expect(secondConsume.statusCode).toBe(404);

    await app.close();
  });
});

