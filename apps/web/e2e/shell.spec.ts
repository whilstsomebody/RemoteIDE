import { test, expect } from "@playwright/test";

test.describe("RemoteIDE Web Shell E2E", () => {
  test("loads the IDE application shell and verifies key layout components", async ({ page }) => {
    await page.goto("/");

    // Verify title
    await expect(page).toHaveTitle(/RemoteIDE/);

    // Verify header title and workspace elements
    await expect(page.getByText("RemoteIDE")).toBeVisible();
    await expect(page.getByText("RemoteIDE Foundation (Phase 0)")).toBeVisible();

    // Verify status bar
    await expect(page.getByText("Host Synced")).toBeVisible();
    await expect(page.getByText("WS Gateway")).toBeVisible();
  });
});

