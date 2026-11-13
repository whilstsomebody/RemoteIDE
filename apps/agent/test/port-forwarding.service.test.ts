import { describe, it, expect } from "vitest";
import { PortForwardingService } from "../src/services/port-forwarding.service.js";
import { AppError } from "@remote-ide/shared";

describe("Phase 5 - Port Forwarding & Preview Service", () => {
  const service = new PortForwardingService();

  it("enforces valid port range between 1024 and 65535", () => {
    // Rejects system port (<1024)
    expect(() => service.forwardPort({ port: 80 })).toThrow(AppError);
    expect(() => service.forwardPort({ port: 443 })).toThrow(AppError);

    // Rejects out of range port (>65535)
    expect(() => service.forwardPort({ port: 70000 })).toThrow(AppError);
  });

  it("blocks reserved internal database/infrastructure ports", () => {
    expect(() => service.forwardPort({ port: 5432 })).toThrow(AppError);
    expect(() => service.forwardPort({ port: 6379 })).toThrow(AppError);
  });

  it("forwards, toggles, and unfowards valid development ports", () => {
    const forwarded = service.forwardPort({
      port: 5173,
      label: "Vite Dev",
      protocol: "http",
    });

    expect(forwarded.port).toBe(5173);
    expect(forwarded.enabled).toBe(true);
    expect(forwarded.targetHost).toBe("127.0.0.1");

    expect(service.isPortApproved(5173)).toBe(true);

    const toggled = service.togglePortForward(5173, false);
    expect(toggled.enabled).toBe(false);
    expect(service.isPortApproved(5173)).toBe(false);

    service.unforwardPort(5173);
    expect(service.isPortApproved(5173)).toBe(false);
  });
});
