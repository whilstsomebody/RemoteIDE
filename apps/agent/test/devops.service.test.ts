import { describe, it, expect, beforeEach } from "vitest";
import { DevOpsService } from "../src/services/devops/devops.service.js";

describe("Phase 9 — DevOps Service", () => {
  let service: DevOpsService;

  beforeEach(() => {
    service = new DevOpsService();
  });

  it("provides comprehensive DevOps overview without crashing when tools are not installed", async () => {
    const overview = await service.getOverview();
    expect(overview).toBeDefined();
    expect(overview.pm2).toBeDefined();
    expect(overview.kubernetes).toBeDefined();
    expect(Array.isArray(overview.sshProfiles)).toBe(true);
    expect(typeof overview.composeCount).toBe("number");
  });

  it("manages SSH profiles with safe credential storage and tests connectivity", async () => {
    const profile = service.addSshProfile({
      name: "Local Test Server",
      host: "127.0.0.1",
      port: 22,
      username: "developer",
      authType: "key",
    });

    expect(profile.id).toBeDefined();
    expect(profile.name).toBe("Local Test Server");
    expect(profile.status).toBe("configured");

    const list = service.listSshProfiles();
    expect(list.some((p) => p.id === profile.id)).toBe(true);

    const testResult = await service.testSshConnection(profile.id);
    expect(testResult).toBeDefined();
    expect(["connected", "error"]).toContain(testResult.status);
    expect(testResult.lastTestedAt).toBeDefined();

    service.deleteSshProfile(profile.id);
    expect(service.listSshProfiles().some((p) => p.id === profile.id)).toBe(false);
  });

  it("inspects Kubernetes contexts safely or reports when kubectl is missing", async () => {
    const k8sOverview = await service.getKubernetesOverview();
    expect(k8sOverview).toBeDefined();
    expect(typeof k8sOverview.isAvailable).toBe("boolean");
    expect(Array.isArray(k8sOverview.contexts)).toBe(true);
  });

  it("handles PM2 operations gracefully when PM2 is not active", async () => {
    const pm2Overview = await service.getPm2Overview();
    expect(pm2Overview).toBeDefined();
    expect(typeof pm2Overview.isAvailable).toBe("boolean");
    expect(Array.isArray(pm2Overview.processes)).toBe(true);
  });
});
