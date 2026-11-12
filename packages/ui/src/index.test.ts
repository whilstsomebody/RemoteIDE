import { describe, it, expect } from "vitest";
import { cn } from "./lib/utils.js";

describe("@remote-ide/ui", () => {
  it("merges tailwind class names properly", () => {
    const className = cn("px-2 py-1", "bg-red-500", { "text-white": true, "opacity-0": false });
    expect(className).toContain("px-2");
    expect(className).toContain("py-1");
    expect(className).toContain("bg-red-500");
    expect(className).toContain("text-white");
    expect(className).not.toContain("opacity-0");
  });

  it("handles tailwind class conflicts with twMerge", () => {
    const className = cn("p-4", "p-2");
    expect(className).toBe("p-2");
  });
});
