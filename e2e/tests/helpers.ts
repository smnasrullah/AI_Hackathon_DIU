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

export async function fillLogin(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

export async function loginAs(page: Page, role: Role): Promise<void> {
  const { email, password, home } = ACCOUNTS[role];
  await fillLogin(page, email, password);
  await expect(page).toHaveURL((url) => url.pathname === home);
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
