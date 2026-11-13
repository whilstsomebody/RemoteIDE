import { afterEach, expect, it, vi } from "vitest";
import { GATEWAY_URL, authenticatedWebSocketUrl, gatewayFetch } from "../src/lib/api/client";

afterEach(() => { vi.unstubAllGlobals(); });
it("authenticates gateway requests without leaking credentials to other origins", async () => {
  vi.stubGlobal("localStorage", { getItem: () => "session-secret" });
  const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", fetchMock);
  await gatewayFetch(`${GATEWAY_URL}/api/v1/workspaces`, { headers: { "Content-Type": "application/json" } });
  const init = fetchMock.mock.calls[0]![1];
  expect(init.headers.get("authorization")).toBe("Bearer session-secret");
  expect(init.headers.get("content-type")).toBe("application/json");
  expect(init.credentials).toBe("include");
  await gatewayFetch("https://unrelated.example/test");
  expect(fetchMock.mock.calls[1]![1].headers.has("authorization")).toBe(false);
  expect(new URL(authenticatedWebSocketUrl("ws://localhost:4000/api/v1/ws")).searchParams.get("token")).toBe("session-secret");
});
