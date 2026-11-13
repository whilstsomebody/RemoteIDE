import { describe, it, expect, beforeEach } from "vitest";
import { buildApp } from "../src/app.js";
import { authService } from "../src/services/auth.service.js";
import { tunnelRelayService } from "../src/services/tunnel-relay.service.js";
import { UserRole, Permission, ROLE_PERMISSIONS } from "@remote-ide/shared";

describe("Phase 3 - Capability-Based Access Control & Dual-Layer Security", () => {
  beforeEach(() => {
    (authService as any).users.clear();
    (authService as any).sessions.clear();
    (authService as any).tokenHashToSessionId.clear();
  });

  it("enforces role capabilities and blocks forbidden operations", async () => {
    const app = await buildApp({ logger: false });

    // Mock a connected host agent in tunnelRelayService
    (tunnelRelayService as any).connectedAgents.set("local-host-agent", {
      hostId: "local-host-agent",
      socket: {
        readyState: 1, // OPEN
        send: () => {},
      },
      connectedAt: new Date().toISOString(),
      lastHeartbeatAt: new Date().toISOString(),
    });

    // 1. Create a Viewer session
    const { sessionToken: viewerToken } = authService.createSessionInternal({
      userId: "viewer-user",
      hostId: "local-host-agent",
      role: UserRole.VIEWER,
      capabilities: ROLE_PERMISSIONS[UserRole.VIEWER],
      allowedWorkspaceIds: [],
      deviceName: "Viewer iPad",
      ipAddress: "1.2.3.4",
      userAgent: "Safari",
      isOwner: false,
      durationSeconds: 3600,
    });

    // Viewer trying to write a file -> 403 Forbidden
    const viewerWriteRes = await app.inject({
      method: "PUT",
      url: "/api/v1/workspaces/ws-1/files/write",
      headers: { authorization: `Bearer ${viewerToken}` },
      payload: { path: "src/index.ts", content: "malicious edit" },
    });
    expect(viewerWriteRes.statusCode).toBe(403);
    expect(JSON.parse(viewerWriteRes.payload).error.message).toContain("lacks capability");

    // Viewer trying to delete a file -> 403 Forbidden
    const viewerDeleteRes = await app.inject({
      method: "DELETE",
      url: "/api/v1/workspaces/ws-1/files?path=src/index.ts",
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    expect(viewerDeleteRes.statusCode).toBe(403);

    // 2. Create an Editor session
    const { sessionToken: editorToken } = authService.createSessionInternal({
      userId: "editor-user",
      hostId: "local-host-agent",
      role: UserRole.EDITOR,
      capabilities: ROLE_PERMISSIONS[UserRole.EDITOR],
      allowedWorkspaceIds: [],
      deviceName: "Editor Laptop",
      ipAddress: "1.2.3.5",
      userAgent: "Chrome",
      isOwner: false,
      durationSeconds: 3600,
    });

    // Editor trying to delete a file -> 403 Forbidden (Editor lacks FS_DELETE)
    const editorDeleteRes = await app.inject({
      method: "DELETE",
      url: "/api/v1/workspaces/ws-1/files?path=src/index.ts",
      headers: { authorization: `Bearer ${editorToken}` },
    });
    expect(editorDeleteRes.statusCode).toBe(403);

    // Editor trying to spawn terminal -> 403 Forbidden (Terminal is Owner-only!)
    const editorTerminalRes = await app.inject({
      method: "POST",
      url: "/api/v1/workspaces/ws-1/terminal/spawn",
      headers: { authorization: `Bearer ${editorToken}` },
    });
    expect(editorTerminalRes.statusCode).toBe(403);

    // 3. Create a Developer session
    const { sessionToken: devToken } = authService.createSessionInternal({
      userId: "dev-user",
      hostId: "local-host-agent",
      role: UserRole.DEVELOPER,
      capabilities: ROLE_PERMISSIONS[UserRole.DEVELOPER],
      allowedWorkspaceIds: [],
      deviceName: "Dev Workstation",
      ipAddress: "1.2.3.6",
      userAgent: "Firefox",
      isOwner: false,
      durationSeconds: 3600,
    });

    // Developer trying to spawn full host terminal -> 403 Forbidden (Terminal is strictly Owner-only)
    const devTerminalRes = await app.inject({
      method: "POST",
      url: "/api/v1/workspaces/ws-1/terminal/spawn",
      headers: { authorization: `Bearer ${devToken}` },
    });
    expect(devTerminalRes.statusCode).toBe(403);

    await app.close();
  });

  it("prevents shared users from escaping authorized workspace boundaries", async () => {
    const app = await buildApp({ logger: false });

    // Mock connected host agent
    (tunnelRelayService as any).connectedAgents.set("local-host-agent", {
      hostId: "local-host-agent",
      socket: { readyState: 1, send: () => {} },
      connectedAt: new Date().toISOString(),
      lastHeartbeatAt: new Date().toISOString(),
    });

    // Session restricted exclusively to "workspace-frontend"
    const { sessionToken } = authService.createSessionInternal({
      userId: "contractor-1",
      hostId: "local-host-agent",
      role: UserRole.EDITOR,
      capabilities: ROLE_PERMISSIONS[UserRole.EDITOR],
      allowedWorkspaceIds: ["workspace-frontend"],
      deviceName: "Contractor Mac",
      ipAddress: "198.51.100.2",
      userAgent: "Chrome",
      isOwner: false,
      durationSeconds: 3600,
    });

    // Attempting to access unauthorized workspace "workspace-backend" -> 403
    const blockedRes = await app.inject({
      method: "GET",
      url: "/api/v1/workspaces/workspace-backend/files",
      headers: { authorization: `Bearer ${sessionToken}` },
    });

    expect(blockedRes.statusCode).toBe(403);
    const body = JSON.parse(blockedRes.payload);
    expect(body.error.message).toContain("only permits access to specific workspaces");

    await app.close();
  });

  it("immediately denies access when a session is revoked or expired", async () => {
    const app = await buildApp({ logger: false });

    const { session, sessionToken } = authService.createSessionInternal({
      userId: "temp-user",
      hostId: "local-host-agent",
      role: UserRole.VIEWER,
      capabilities: [Permission.FS_READ],
      allowedWorkspaceIds: [],
      deviceName: "Temp Phone",
      ipAddress: "1.1.1.1",
      userAgent: "Safari",
      isOwner: false,
      durationSeconds: 3600,
    });

    // Revoke the session
    authService.revokeSession(session.id, "owner-admin");

    // Any subsequent request is denied with 401
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/workspaces",
      headers: { authorization: `Bearer ${sessionToken}` },
    });

    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

