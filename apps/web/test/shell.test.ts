import { describe, it, expect } from "vitest";
import { Header } from "../src/components/shell/header";
import { StatusBar } from "../src/components/shell/status-bar";

describe("Web Shell Components", () => {
  it("exports Header and StatusBar React components", () => {
    expect(Header).toBeDefined();
    expect(StatusBar).toBeDefined();
    expect(typeof Header).toBe("function");
    expect(typeof StatusBar).toBe("function");
  });
});
