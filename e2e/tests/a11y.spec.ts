import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import type { Role } from "../routes";
import { hasHorizontalScroll, loginAs, pathOf } from "./helpers";

// Main routes per role, checked at phone and desktop width: axe (WCAG 2.1 A/AA) must find no
// serious or critical violation, and no page may scroll sideways.
const MAIN: Record<Role | "public", string[]> = {
  public: ["/", "/login"],
  agent: ["/agent", "/agent/forecast", "/agent/stockout", "/agent/rebalance", "/agent/what-if",
    "/agent/explain", "/agent/copilot", "/agent/help", "/notifications", "/settings"],
  distributor: ["/distributor", "/distributor/agents", "/distributor/agents/1", "/distributor/swaps",
    "/distributor/anomalies", "/distributor/impact", "/distributor/briefing",
    "/distributor/help-requests", "/responsible-ai"],
  admin: ["/admin", "/admin/users", "/admin/models", "/admin/llm", "/admin/audit-log", "/admin/events",
    "/admin/data", "/admin/help-settings"],
};

const VIEWPORTS = [
  { name: "mobile 390", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  { name: "desktop 1440", use: { viewport: { width: 1440, height: 900 } } },
];

const BLOCKING = new Set(["serious", "critical"]);

async function audit(page: Page, path: string): Promise<string[]> {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  expect(pathOf(page), `${path} redirected away`).toBe(path);
  await expect(page.locator("main")).not.toBeEmpty();
  return scan(page, path);
}

/** axe (serious / critical only) and sideways scroll on the page as it is now (e.g. a dialog open). */
async function scan(page: Page, path: string): Promise<string[]> {
  // Skeletons resolve after the data lands; audit the settled page.
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  const problems: string[] = [];
  if (await hasHorizontalScroll(page)) problems.push(`${path}: scrolls horizontally`);
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  for (const v of result.violations) {
    if (!v.impact || !BLOCKING.has(v.impact)) continue;
    const where = v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ");
    const why = v.nodes[0]?.any[0]?.message ?? "";
    problems.push(`${path}: ${v.id} (${v.impact}, ${v.nodes.length}x) ${where} -- ${why}`);
  }
  return problems;
}

for (const vp of VIEWPORTS) {
  test.describe(`a11y + layout, ${vp.name}`, () => {
    // Reduced motion: nothing is mid-fade when axe measures contrast.
    test.use({ ...vp.use, reducedMotion: "reduce" });

    for (const [role, paths] of Object.entries(MAIN) as [Role | "public", string[]][]) {
      test(`${role} main routes`, async ({ page }) => {
        test.setTimeout(150_000);
        if (role !== "public") await loginAs(page, role);
        const problems: string[] = [];
        for (const path of paths) {
          await test.step(path, async () => {
            problems.push(...(await audit(page, path)));
          });
        }
        expect(problems, problems.join("\n")).toEqual([]);
      });
    }

    test("help request detail (distributor)", async ({ page }) => {
      test.setTimeout(90_000);
      await loginAs(page, "distributor");
      await page.goto("/distributor/help-requests");
      const row = page.locator('[data-testid^="help-row-"]').first();
      await expect(row.or(page.getByTestId("help-request-empty"))).toBeVisible({ timeout: 30_000 });
      const href = (await row.count()) > 0 ? await row.getAttribute("href") : null;
      // A fresh database has no request yet (an unknown id is the 403 page): nothing to open.
      test.skip(href === null, "no help request for this distributor yet");
      const problems = await audit(page, href ?? "");
      expect(problems, problems.join("\n")).toEqual([]);
    });

    test("admin users: reject sign-up dialog", async ({ page }) => {
      test.setTimeout(90_000);
      await loginAs(page, "admin");
      // bootstrap.py e2e-fixtures keeps one pending sign-up (e2e.pending@example.org).
      await page.goto("/admin/users?status=pending");
      await page.waitForLoadState("networkidle");
      // The settled table, not the start-up screen: the pending row is on the page.
      await expect(page.getByText("e2e.pending@example.org")).toBeVisible({ timeout: 30_000 });
      const problems = await scan(page, "/admin/users?status=pending");
      await page.getByRole("button", { name: "Reject: e2e.pending@example.org" }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog.locator(":focus")).toHaveCount(1); // focus moved into the dialog
      problems.push(...(await scan(page, "/admin/users reject dialog")));
      await page.keyboard.press("Escape"); // leave it pending for the other viewport
      await expect(dialog).toHaveCount(0);
      expect(problems, problems.join("\n")).toEqual([]);
    });
  });
}
