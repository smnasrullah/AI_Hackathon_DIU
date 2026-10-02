import { expect, test } from "@playwright/test";

import { loginAs, logoutFromMenu } from "./helpers";

test("logout from the avatar menu ends the session", async ({ page }) => {
  await loginAs(page, "distributor");
  await logoutFromMenu(page);
  await page.goto("/distributor");
  await expect(page).toHaveURL(/\/login$/);
});

test("Ctrl+K opens the command palette and jumps to an agent", async ({ page }) => {
  await loginAs(page, "distributor");
  await page.keyboard.press("Control+k");
  const palette = page.getByTestId("command-palette");
  await expect(palette).toBeVisible();

  await palette.getByRole("combobox").fill("AGT-0001");
  const hit = palette.getByRole("option", { name: /AGT-0001/ });
  await expect(hit).toBeVisible();
  await hit.click();
  await expect(page).toHaveURL(/\/distributor\/agents\/\d+$/);
  await expect(palette).toHaveCount(0);
});

test("notifications can be read from the bell", async ({ page }) => {
  await loginAs(page, "distributor");
  const bell = page.getByTestId("notification-bell");
  await bell.click();
  const panel = page.getByRole("dialog", { name: "Notifications" });
  await expect(panel).toBeVisible();

  if ((await page.getByTestId("notification-badge").count()) > 0) {
    await panel.getByRole("button", { name: "Mark all read" }).click();
    await expect(page.getByTestId("notification-badge")).toHaveCount(0);
    await expect(panel.locator('[data-testid="notification-row"][data-unread="true"]')).toHaveCount(0);
  } else {
    await expect(panel.getByText("All caught up")).toBeVisible();
  }

  await panel.getByRole("link", { name: "View all notifications" }).click();
  await expect(page).toHaveURL(/\/notifications$/);
});

test("preferences persist on the server", async ({ page }) => {
  await loginAs(page, "admin");
  await page.goto("/settings");
  const bangla = page.getByRole("radio", { name: "১২৩" });
  const latin = page.getByRole("radio", { name: "123" });
  await bangla.click();
  await expect(bangla).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("theme-preview")).toContainText("৳১,২০,০০০");

  try {
    // Drop the local copy: after reload only the server profile can bring the choice back.
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await expect(page.getByRole("radio", { name: "১২৩" })).toHaveAttribute("aria-checked", "true");
  } finally {
    await page.getByRole("radio", { name: "123" }).click();
    await expect(latin).toHaveAttribute("aria-checked", "true");
  }
});

test("the tour can be replayed from Help", async ({ page }) => {
  await loginAs(page, "admin");
  await page.goto("/help");
  await page.getByRole("button", { name: "Replay the tour" }).click();
  const tour = page.getByTestId("onboarding-tour");
  await expect(tour).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tour).toHaveCount(0);
});
