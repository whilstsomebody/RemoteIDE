import { it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { HostIdentityService } from "../src/services/host-identity.service.js";

it("preserves a generated host identity across restarts", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "identity-test-"));
  try {
    const first = new HostIdentityService(dir).getHostId();
    expect(new HostIdentityService(dir).getHostId()).toBe(first);
    expect(new HostIdentityService(dir, "explicit-host").getHostId()).toBe("explicit-host");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
