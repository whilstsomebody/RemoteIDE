import { describe, it, expect, vi } from "vitest";
import { ConnectionRecoveryManager } from "../src/lib/network/connection-recovery";
import { MobileNavBar } from "../src/components/mobile/mobile-nav-bar";
import { MobileKeyboardToolbar } from "../src/components/mobile/mobile-keyboard-toolbar";
import { MobileHeader } from "../src/components/mobile/mobile-header";
import { MobileFileExplorer } from "../src/components/mobile/mobile-file-explorer";
import { MobileTerminalView } from "../src/components/mobile/mobile-terminal-view";
import { MobileGitView } from "../src/components/mobile/mobile-git-view";
import { TabletLayout } from "../src/components/tablet/tablet-layout";
import { DeviceHandoffModal } from "../src/components/handoff/device-handoff-modal";
import { detectDeviceFormFactor } from "@remote-ide/shared";

describe("Phase 10 — Mobile, Tablet, PWA, and Cross-Device Continuity", () => {
  describe("Component Export Integrity", () => {
    it("exports all mobile components", () => {
      expect(MobileNavBar).toBeDefined();
      expect(MobileKeyboardToolbar).toBeDefined();
      expect(MobileHeader).toBeDefined();
      expect(MobileFileExplorer).toBeDefined();
      expect(MobileTerminalView).toBeDefined();
      expect(MobileGitView).toBeDefined();
    });

    it("exports tablet adaptive layout", () => {
      expect(TabletLayout).toBeDefined();
    });

    it("exports cross-device handoff modal", () => {
      expect(DeviceHandoffModal).toBeDefined();
    });
  });

  describe("Device Form Factor Detection", () => {
    it("detects mobile phones from user-agent string", () => {
      const iPhoneUa =
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1";
      const androidMobileUa =
        "Mozilla/5.0 (Linux; Android 13; Pixel 7 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36";

      expect(detectDeviceFormFactor(iPhoneUa)).toBe("phone");
      expect(detectDeviceFormFactor(androidMobileUa)).toBe("phone");
    });

    it("detects tablets from user-agent string", () => {
      const iPadUa =
        "Mozilla/5.0 (iPad; CPU OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1";
      const androidTabletUa =
        "Mozilla/5.0 (Linux; Android 12; SM-X906N Build/SP1A.210812.016; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/94.0.4606.85 Safari/537.36";

      expect(detectDeviceFormFactor(iPadUa)).toBe("tablet");
      expect(detectDeviceFormFactor(androidTabletUa)).toBe("tablet");
    });

    it("detects desktop browsers from user-agent string", () => {
      const macDesktopUa =
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36";
      const windowsDesktopUa =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36";

      expect(detectDeviceFormFactor(macDesktopUa)).toBe("desktop");
      expect(detectDeviceFormFactor(windowsDesktopUa)).toBe("desktop");
    });
  });

  describe("Connection Recovery Manager (Exponential Backoff with Jitter)", () => {
    it("increments delay exponentially without jitter", () => {
      const recovery = new ConnectionRecoveryManager({
        initialDelayMs: 1000,
        maxDelayMs: 10000,
        backoffFactor: 2,
        jitter: false,
      });

      expect(recovery.getNextDelay()).toBe(1000); // 1000 * 2^0
      expect(recovery.getNextDelay()).toBe(2000); // 1000 * 2^1
      expect(recovery.getNextDelay()).toBe(4000); // 1000 * 2^2
      expect(recovery.getNextDelay()).toBe(8000); // 1000 * 2^3
      expect(recovery.getNextDelay()).toBe(10000); // capped at maxDelayMs 10000
    });

    it("applies bounded jitter within +/- 20%", () => {
      const recovery = new ConnectionRecoveryManager({
        initialDelayMs: 1000,
        maxDelayMs: 10000,
        backoffFactor: 2,
        jitter: true,
      });

      const delay1 = recovery.getNextDelay();
      expect(delay1).toBeGreaterThanOrEqual(800);
      expect(delay1).toBeLessThanOrEqual(1200);

      const delay2 = recovery.getNextDelay();
      expect(delay2).toBeGreaterThanOrEqual(1600);
      expect(delay2).toBeLessThanOrEqual(2400);
    });

    it("resets backoff attempts to zero", () => {
      const recovery = new ConnectionRecoveryManager({
        initialDelayMs: 1000,
        maxDelayMs: 10000,
        backoffFactor: 2,
        jitter: false,
      });

      recovery.getNextDelay();
      recovery.getNextDelay();
      expect(recovery.getNextDelay()).toBe(4000);

      recovery.reset();
      expect(recovery.getNextDelay()).toBe(1000);
    });

    it("schedules reconnect timer and cancels properly", () => {
      vi.useFakeTimers();
      const recovery = new ConnectionRecoveryManager({
        initialDelayMs: 500,
        jitter: false,
      });

      const callback = vi.fn();
      recovery.scheduleReconnect(callback);

      expect(callback).not.toHaveBeenCalled();
      vi.advanceTimersByTime(500);
      expect(callback).toHaveBeenCalledTimes(1);

      recovery.scheduleReconnect(callback);
      recovery.cancelScheduled();
      vi.advanceTimersByTime(1000);
      expect(callback).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });
  });
});

