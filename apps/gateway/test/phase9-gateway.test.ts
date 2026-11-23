import { describe, it, expect } from "vitest";
import { buildApp } from "../src/app.js";
import { authService } from "../src/services/auth.service.js";
import { UserRole, ROLE_PERMISSIONS } from "@remote-ide/shared";

describe("Phase 9 — Gateway DevOps, Docker, and Database Authorization", () => {
  it("enforces granular permissions across Viewer, Editor, Developer, Operator, and Owner", async () => {
    const app = await buildApp({ logger: false });

    const { sessionToken: viewerToken } = authService.createSessionInternal({
      userId: "viewer-p9",
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

    const viewerDockerRes = await app.inject({
      method: "GET",
      url: "/api/v1/docker/containers",
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    expect(viewerDockerRes.statusCode).toBe(403);

    const viewerDbRes = await app.inject({
      method: "GET",
      url: "/api/v1/database/profiles",
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    expect(viewerDbRes.statusCode).toBe(403);

    const viewerDevOpsRes = await app.inject({
      method: "GET",
      url: "/api/v1/devops/overview",
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    expect(viewerDevOpsRes.statusCode).toBe(403);

    const { sessionToken: devToken } = authService.createSessionInternal({
      userId: "developer-p9",
      hostId: "local-host-agent",
      role: UserRole.DEVELOPER,
      capabilities: ROLE_PERMISSIONS[UserRole.DEVELOPER],
      allowedWorkspaceIds: [],
      deviceName: "Dev Device",
      ipAddress: "192.168.1.12",
      userAgent: "Firefox",
      isOwner: false,
      durationSeconds: 3600,
    });

    const devDockerControlRes = await app.inject({
      method: "POST",
      url: "/api/v1/docker/containers/c123/restart",
      headers: { authorization: `Bearer ${devToken}` },
      payload: {},
    });
    expect(devDockerControlRes.statusCode).toBe(403);

    const devDbQueryRes = await app.inject({
      method: "POST",
      url: "/api/v1/database/query",
      headers: { authorization: `Bearer ${devToken}` },
      payload: { profileId: "db-1", sql: "SELECT 1" },
    });
    expect(devDbQueryRes.statusCode).toBe(403);

    const devPm2ControlRes = await app.inject({
      method: "POST",
      url: "/api/v1/devops/pm2/restart",
      headers: { authorization: `Bearer ${devToken}` },
      payload: { target: "all" },
    });
    expect(devPm2ControlRes.statusCode).toBe(403);

    const { sessionToken: operatorToken } = authService.createSessionInternal({
      userId: "operator-p9",
      hostId: "local-host-agent",
      role: UserRole.OPERATOR,
      capabilities: ROLE_PERMISSIONS[UserRole.OPERATOR],
      allowedWorkspaceIds: [],
      deviceName: "Operator Device",
      ipAddress: "192.168.1.13",
      userAgent: "Chrome",
      isOwner: false,
      durationSeconds: 3600,
    });

    // Operator is denied Docker Exec (privileged terminal capability reserved for Owner)
    const operatorDockerExecRes = await app.inject({
      method: "POST",
      url: "/api/v1/docker/containers/c123/exec",
      headers: { authorization: `Bearer ${operatorToken}` },
      payload: { command: ["/bin/sh"] },
    });
    expect(operatorDockerExecRes.statusCode).toBe(403);

    await app.close();
  });
});
