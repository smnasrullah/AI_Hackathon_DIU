import { expect, test } from "@playwright/test";

import type { Role } from "../routes";
import { ACCOUNTS, fillLogin, loginAs, pathOf } from "./helpers";

const ROLES: Role[] = ["agent", "distributor", "admin"];

for (const role of ROLES) {
  test(`login as ${role} lands on its home`, async ({ page }) => {
    await loginAs(page, role);
    expect(pathOf(page)).toBe(ACCOUNTS[role].home);
    await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
  });
}

test("logout then Back cannot show a protected page", async ({ page }) => {
  await loginAs(page, "agent");
  await page.getByRole("link", { name: "Forecast" }).click();
  await expect(page).toHaveURL(/\/agent\/forecast$/);
  await expect(page.getByRole("heading", { name: "72h forecast" })).toBeVisible();

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);

  // Walk back through all history: each step lands on /login or leaves the app (about:blank).
  for (let i = 0; i < 3; i++) {
    await page.goBack();
    await expect(page).toHaveURL(/\/login$|^about:blank$/);
    await expect(page.getByRole("heading", { name: "72h forecast" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Log out" })).toHaveCount(0);
  }

  // A fresh load of the protected URL must not restore the session either.
  await page.goto("/agent/forecast");
  await expect(page).toHaveURL(/\/login$/);
});

test("wrong password shows an error", async ({ page }) => {
  // A demo account no other test signs in with, so its lockout counter cannot block them.
  await fillLogin(page, "agent.sunamganj@agentpulse.demo", "definitely-not-the-password");
  await expect(page.getByRole("alert")).toContainText("Email or password is incorrect.");
  await expect(page).toHaveURL(/\/login$/);
});

test("wrong-role route shows 403", async ({ page }) => {
  await loginAs(page, "agent");
  for (const path of ["/admin", "/distributor/swaps"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/403$/);
    await expect(page.getByRole("heading", { name: "This page is not for your role" })).toBeVisible();
  }
});
