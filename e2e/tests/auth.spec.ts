import { expect, test } from "@playwright/test";

import type { Role } from "../routes";
import { ACCOUNTS, fillLogin, loginAs, logoutFromMenu, pathOf } from "./helpers";

const ROLES: Role[] = ["agent", "distributor", "admin"];

for (const role of ROLES) {
  test(`login as ${role} lands on its home`, async ({ page }) => {
    await loginAs(page, role);
    expect(pathOf(page)).toBe(ACCOUNTS[role].home);
    await expect(page.getByTestId("avatar-menu")).toBeVisible();
  });
}

test("logout then Back cannot show a protected page", async ({ page }) => {
  await loginAs(page, "agent");
  await page.locator('nav a[href="/agent/forecast"]').click();
  await expect(page).toHaveURL(/\/agent\/forecast$/);
  await expect(page.getByRole("heading", { name: /72h forecast|৭২ ঘণ্টার পূর্বাভাস/ })).toBeVisible();

  await logoutFromMenu(page);

  // Walk back through all history: each step lands on /login or leaves the app (about:blank).
  for (let i = 0; i < 3; i++) {
    await page.goBack();
    await expect(page).toHaveURL(/\/login$|^about:blank$/);
    await expect(page.getByRole("heading", { name: /72h forecast|৭২ ঘণ্টার পূর্বাভাস/ })).toHaveCount(0);
    await expect(page.getByTestId("avatar-menu")).toHaveCount(0);
  }

  // A fresh load of the protected URL must not restore the session either.
  await page.goto("/agent/forecast");
  await expect(page).toHaveURL(/\/login$/);
});

test("wrong password shows an error", async ({ page }) => {
  // A demo account no other test signs in with, so its lockout counter cannot block them.
  await fillLogin(page, "agent.sunamganj@agentpulse.demo", "definitely-not-the-password");
  await expect(page.getByRole("alert")).toContainText(/Email or password is incorrect\.|ইমেইল বা পাসওয়ার্ড ভুল।/);
  await expect(page).toHaveURL(/\/login$/);
});

test("wrong-role route shows 403", async ({ page }) => {
  await loginAs(page, "agent");
  for (const path of ["/admin", "/distributor/swaps"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/403$/);
    // The agent demo account reads Bangla by default.
    await expect(page.getByRole("heading", { name: /This page is not for your role|এই পেজ আপনার ভূমিকার জন্য নয়/ })).toBeVisible();
  }
});

test("opening the app does not sign anyone in", async ({ page }) => {
  for (const path of ["/", "/login", "/agent"]) {
    await page.goto(path);
    await expect(page).toHaveURL(path === "/agent" ? /\/login$/ : new RegExp(`${path}$`));
    await expect(page.getByTestId("avatar-menu")).toHaveCount(0);
  }
});

test("sign-up creates a pending account that cannot sign in yet", async ({ page }) => {
  const email = `e2e.signup.${Date.now()}@example.org`;
  const password = "e2e-signup-pass-1";
  await page.goto("/signup");
  await page.locator("#fullName").fill("E2E Signup");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator("#confirm").fill(password);
  const answer = page.waitForResponse((res) => res.url().endsWith("/auth/signup"));
  await page.getByTestId("signup-submit").click();
  // The per-IP sign-up limit is in backend memory; reruns within the hour can hit it.
  test.skip((await answer).status() === 429, "sign-up rate limit reached for this IP (restart the backend)");
  await expect(page.getByTestId("signup-pending")).toBeVisible();

  await fillLogin(page, email, password);
  await expect(page.getByRole("alert")).toContainText(/Email or password is incorrect\.|ইমেইল বা পাসওয়ার্ড ভুল।/);
  await expect(page).toHaveURL(/\/login$/);
});

test("forgot password answers the same for unknown e-mail; reset needs a token", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: /Forgot password\?|পাসওয়ার্ড ভুলে গেছেন\?/ }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await page.locator("#email").fill("nobody.e2e@example.org");
  const answer = page.waitForResponse((res) => res.url().endsWith("/auth/forgot-password"));
  await page.getByTestId("forgot-submit").click();
  test.skip((await answer).status() === 429, "reset request limit reached for this IP (restart the backend)");
  await expect(page.getByTestId("forgot-sent")).toBeVisible();

  await page.goto("/reset-password");
  await expect(page.getByTestId("reset-submit")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Request a new link|নতুন লিংক চান/ })).toBeVisible();
});
