import { describe, it, expect } from "vitest";
import { buildApp } from "../src/app.js";
import { authService } from "../src/services/auth.service.js";
import { UserRole, ROLE_PERMISSIONS } from "@remote-ide/shared";

describe("Phase 8 — Gateway LSP, Debugging, and Test Integration", () => {
  it("enforces separate permissions: denies debug execution to Viewer and Editor roles", async () => {
    const app = await buildApp({ logger: false });

    const { sessionToken: viewerToken } = authService.createSessionInternal({
      userId: "viewer-u",
      hostId: "local-host-agent",
      role: UserRole.VIEWER,
      capabilities: ROLE_PERMISSIONS[UserRole.VIEWER],
      allowedWorkspaceIds: [],
      deviceName: "Viewer Device",
      ipAddress: "192.168.1.10",
      userAgent: "Safari",
      isOwner: false,
      durationSeconds: 3600,
    });

    const viewerDebugRes = await app.inject({
      method: "POST",
      url: "/api/v1/debug/launch",
      headers: { authorization: `Bearer ${viewerToken}` },
      payload: { workspaceId: "ws-1", program: "index.js" },
    });
    expect(viewerDebugRes.statusCode).toBe(403);

    const viewerTestRes = await app.inject({
      method: "POST",
      url: "/api/v1/tests/run",
      headers: { authorization: `Bearer ${viewerToken}` },
      payload: { workspaceId: "ws-1", scope: "all" },
    });
    expect(viewerTestRes.statusCode).toBe(403);

    const { sessionToken: editorToken } = authService.createSessionInternal({
      userId: "editor-u",
      hostId: "local-host-agent",
      role: UserRole.EDITOR,
      capabilities: ROLE_PERMISSIONS[UserRole.EDITOR],
      allowedWorkspaceIds: [],
      deviceName: "Editor Device",
      ipAddress: "192.168.1.11",
      userAgent: "Chrome",
      isOwner: false,
      durationSeconds: 3600,
    });

    // Editor is denied debug execution (strictly reserved for Developer/Operator/Owner)
    const editorDebugRes = await app.inject({
      method: "POST",
      url: "/api/v1/debug/launch",
      headers: { authorization: `Bearer ${editorToken}` },
      payload: { workspaceId: "ws-1", program: "index.js" },
    });
    expect(editorDebugRes.statusCode).toBe(403);

    await app.close();
  });
});
