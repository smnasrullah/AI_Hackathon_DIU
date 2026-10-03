import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import type { Role } from "../routes";
import { hasHorizontalScroll, loginAs, pathOf } from "./helpers";

// Main routes per role, checked at phone and desktop width: axe (WCAG 2.1 A/AA) must find no
// serious or critical violation, and no page may scroll sideways.
const MAIN: Record<Role | "public", string[]> = {
  public: ["/", "/login"],
  agent: ["/agent", "/agent/forecast", "/agent/stockout", "/agent/rebalance", "/agent/what-if",
    "/agent/explain", "/agent/copilot", "/notifications", "/settings"],
  distributor: ["/distributor", "/distributor/agents", "/distributor/agents/1", "/distributor/swaps",
    "/distributor/anomalies", "/distributor/impact", "/distributor/briefing", "/responsible-ai"],
  admin: ["/admin", "/admin/users", "/admin/models", "/admin/llm", "/admin/audit-log", "/admin/events",
    "/admin/data"],
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
  });
}
