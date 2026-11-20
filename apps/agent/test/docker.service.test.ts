import { describe, it, expect, beforeEach } from "vitest";
import { DockerService } from "../src/services/docker/docker.service.js";
import { AppError } from "@remote-ide/shared";

describe("Phase 9 — Docker Service", () => {
  let service: DockerService;

  beforeEach(() => {
    service = new DockerService();
  });

  it("detects Docker availability and returns an overview without throwing", async () => {
    const overview = await service.getOverview();
    expect(overview).toBeDefined();
    expect(typeof overview.isAvailable).toBe("boolean");
    expect(typeof overview.containerCount).toBe("number");
    expect(typeof overview.runningCount).toBe("number");
    expect(typeof overview.imageCount).toBe("number");
    expect(typeof overview.volumeCount).toBe("number");
    expect(typeof overview.composeCount).toBe("number");
  }, 15000);

  it("lists containers, images, volumes, and networks", async () => {
    const isAvail = await service.checkAvailability();

    if (isAvail) {
      const containers = await service.listContainers(true);
      expect(Array.isArray(containers)).toBe(true);

      const images = await service.listImages();
      expect(Array.isArray(images)).toBe(true);

      const volumes = await service.listVolumes();
      expect(Array.isArray(volumes)).toBe(true);

      const networks = await service.listNetworks();
      expect(Array.isArray(networks)).toBe(true);
    } else {
      // Safe fallback when Docker daemon is not active
      const containers = await service.listContainers();
      expect(containers).toEqual([]);
    }
  });

  it("gracefully handles container actions for non-existent container id", async () => {
    const isAvail = await service.checkAvailability();
    if (isAvail) {
      await expect(service.startContainer("non-existent-container-xyz-123")).rejects.toThrow(
        AppError
      );

      await expect(
        service.getContainerLogs("non-existent-container-xyz-123", { tail: 50 })
      ).rejects.toThrow(AppError);
    }
  });
});
