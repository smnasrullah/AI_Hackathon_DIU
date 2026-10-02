import { expect, type Page } from "@playwright/test";

import type { Role } from "../routes";

// Passwords come from .env (compose env_file); fallbacks match .env.example.
export const ACCOUNTS: Record<Role, { email: string; password: string; home: string }> = {
  agent: {
    email: "agent.mirpur@agentpulse.demo",
    password: process.env.DEMO_AGENT_PASSWORD || "agent-demo-2026",
    home: "/agent",
  },
  distributor: {
    email: "dist.dhaka@agentpulse.demo",
    password: process.env.DEMO_DISTRIBUTOR_PASSWORD || "distributor-demo-2026",
    home: "/distributor",
  },
  admin: {
    email: "admin@agentpulse.demo",
    password: process.env.DEMO_ADMIN_PASSWORD || "admin-demo-2026",
    home: "/admin",
  },
};

export function pathOf(page: Page): string {
  return new URL(page.url()).pathname;
}

/** Ids and test ids, not labels: the login page is Bangla-first and the labels follow the language. */
export async function fillLogin(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByTestId("login-submit").click();
}

/** True when the page scrolls sideways (a layout bug at that viewport). */
export async function hasHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
}

export async function loginAs(page: Page, role: Role): Promise<void> {
  const { email, password, home } = ACCOUNTS[role];
  await fillLogin(page, email, password);
  await expect(page).toHaveURL((url) => url.pathname === home);
  await dismissTour(page);
}

/** The onboarding tour opens on a user's first visit; it renders with the shell, so check once. */
export async function dismissTour(page: Page): Promise<void> {
  await expect(page.getByTestId("app-shell")).toBeVisible();
  const skip = page.getByTestId("tour-skip");
  if (await skip.isVisible()) {
    // Wait for tour_done to reach the server, so a following page load does not reopen it.
    const saved = page.waitForResponse((res) => res.url().endsWith("/users/me/preferences") && res.ok());
    await skip.click();
    await saved;
    await expect(page.getByTestId("onboarding-tour")).toHaveCount(0);
  }
}

/** Open the avatar menu and log out. */
export async function logoutFromMenu(page: Page): Promise<void> {
  await page.getByTestId("avatar-menu").click();
  await page.getByTestId("logout").click();
  await expect(page).toHaveURL(/\/login$/);
}

const EXPECTED_STATUS = new Set([401, 403]);

/** Collects console errors, uncaught exceptions and failed requests (401/403 are expected). */
export function watchPage(page: Page): { problems: string[] } {
  const problems: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    // Chromium logs every non-2xx fetch as a console error; expected auth statuses are fine.
    if (/Failed to load resource: .*status of (401|403)\b/.test(text)) return;
    problems.push(`console: ${text}`);
  });
  page.on("pageerror", (err) => problems.push(`pageerror: ${err.message}`));
  page.on("requestfailed", (req) => {
    const reason = req.failure()?.errorText ?? "failed";
    // Navigating away aborts in-flight requests; that is not a failure of the page.
    if (reason.includes("ERR_ABORTED")) return;
    problems.push(`requestfailed: ${req.method()} ${req.url()} (${reason})`);
  });
  page.on("response", (res) => {
    const status = res.status();
    if (status >= 400 && !EXPECTED_STATUS.has(status)) {
      problems.push(`http ${status}: ${res.request().method()} ${res.url()}`);
    }
  });
  return { problems };
}
