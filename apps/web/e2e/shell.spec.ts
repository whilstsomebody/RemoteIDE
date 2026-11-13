import { test, expect, type Page, type Route } from "@playwright/test";

async function mockGateway(page: Page) {
  const workspaces = ["alpha", "beta"].map((id) => ({ id, name: `Project ${id}`, folders: [{ id, name: id, path: `/projects/${id}` }], isActive: id === "alpha", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    let data: unknown = {};
    if (url.pathname === "/api/v1/auth/me") data = { role: "owner", isOwner: true };
    else if (url.pathname === "/api/v1/workspaces") data = workspaces;
    else if (url.pathname.endsWith("/open")) {
      workspaces.forEach((ws) => { ws.isActive = url.pathname.includes(`/${ws.id}/`); });
      data = workspaces.find((ws) => ws.isActive);
    } else if (url.pathname.endsWith("/files")) data = [{ name: "shared.txt", path: "shared.txt", type: "file", size: 10 }];
    else if (url.pathname.endsWith("/files/read")) data = { content: url.pathname.includes("/alpha/") ? "alpha original" : "beta original", eTag: "v1", encoding: "utf-8", isBinary: false };
    else if (url.pathname.endsWith("/files/stat")) data = { eTag: "v1", size: 10, mtime: 0 };
    else if (url.pathname.endsWith("/files/write")) data = { eTag: "v2", mtime: 1 };
    else if (url.pathname === "/api/v1/terminals" || url.pathname === "/api/v1/jobs") data = [];
    await route.fulfill({ json: { success: true, data } });
  });
}

test("loads the current IDE shell", async ({ page }) => {
  await mockGateway(page);
  await page.goto("/");
  await expect(page).toHaveTitle(/RemoteIDE/);
  await expect(page.getByRole("heading", { name: "RemoteIDE", exact: true })).toBeVisible();
  await expect(page.getByText("Local-First Browser Remote Development")).toBeVisible();
  await expect(page.getByTitle("Click to switch workspace or open another folder")).toContainText("Project alpha");
});

test("keeps newer typing when a delayed save completes", async ({ page }) => {
  await mockGateway(page);
  let finishSave: (() => Promise<void>) | undefined;
  let markStarted!: () => void;
  const saveStarted = new Promise<void>((resolve) => { markStarted = resolve; });
  await page.route("**/files/write", async (route: Route) => {
    finishSave = () => route.fulfill({ json: { success: true, data: { eTag: "v2", mtime: 1 } } });
    markStarted();
  });
  await page.goto("/");
  await page.getByRole("complementary").getByText("shared.txt", { exact: true }).click();
  const editor = page.locator(".cm-content");
  await expect(editor).toContainText("alpha original");
  await editor.fill("submitted content");
  await editor.press("ControlOrMeta+s");
  await saveStarted;
  await editor.fill("newer unsaved typing");
  await finishSave!();
  await expect(editor).toHaveText("newer unsaved typing");
});

test("does not reuse a file buffer in another workspace", async ({ page }) => {
  await mockGateway(page);
  await page.goto("/");
  await page.getByRole("complementary").getByText("shared.txt", { exact: true }).click();
  await expect(page.locator(".cm-content")).toContainText("alpha original");
  await page.getByTitle("Click to switch workspace or open another folder").click();
  await page.getByText("Project beta", { exact: true }).click();
  await expect(page.getByTitle("Click to switch workspace or open another folder")).toContainText("Project beta");
  await page.getByRole("complementary").getByText("shared.txt", { exact: true }).click();
  await expect(page.locator(".cm-content")).toContainText("beta original");
});

test("stores the redeemed session token returned by the gateway", async ({ page }) => {
  await page.route("**/api/v1/share-links/redeem", (route) => route.fulfill({ json: { success: true, data: { sessionToken: "redeemed-token", session: { id: "guest", role: "viewer", expiresAt: new Date(Date.now() + 3600000).toISOString(), allowedWorkspaceIds: ["alpha"] } } } }));
  await page.goto("/share?token=share-token");
  await page.getByRole("button", { name: "Connect to Workspace" }).click();
  await expect(page.getByText("Access Granted!")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("remote_ide_token"))).toBe("redeemed-token");
});
