"use client";

import { useState, useEffect } from "react";

export interface ViewportState {
  width: number;
  height: number;
  isPhone: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isPortrait: boolean;
  isLandscape: boolean;
  isTouchDevice: boolean;
}

export function useViewport(): ViewportState {
  const [viewport, setViewport] = useState<ViewportState>(() => {
    if (typeof window === "undefined") {
      return {
        width: 1200,
        height: 800,
        isPhone: false,
        isTablet: false,
        isDesktop: true,
        isPortrait: false,
        isLandscape: true,
        isTouchDevice: false,
      };
    }

    const w = window.innerWidth;
    const h = window.innerHeight;
    const isTouch =
      "ontouchstart" in window || (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0);

    return {
      width: w,
      height: h,
      isPhone: w < 768,
      isTablet: w >= 768 && w < 1024,
      isDesktop: w >= 1024,
      isPortrait: h > w,
      isLandscape: w >= h,
      isTouchDevice: isTouch,
    };
  });

  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const isTouch =
        "ontouchstart" in window ||
        (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0);

      setViewport({
        width: w,
        height: h,
        isPhone: w < 768,
        isTablet: w >= 768 && w < 1024,
        isDesktop: w >= 1024,
        isPortrait: h > w,
        isLandscape: w >= h,
        isTouchDevice: isTouch,
      });
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);

    // Initial sync
    handleResize();

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, []);

  return viewport;
}

