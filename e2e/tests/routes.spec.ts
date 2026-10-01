import { expect, test } from "@playwright/test";

import { ROUTES } from "../routes";
import { loginAs, pathOf, watchPage } from "./helpers";

for (const route of ROUTES) {
  test(`${route.path} loads cleanly as ${route.as}`, async ({ page }) => {
    if (route.as !== "public") await loginAs(page, route.as);

    const { problems } = watchPage(page);
    await page.goto(route.path);
    await page.waitForLoadState("networkidle");

    expect(pathOf(page), "route redirected away").toBe(route.path);
    const main = page.locator("main");
    await expect(main).toHaveCount(1);
    await expect(main).not.toBeEmpty();
    expect((await main.innerText()).trim().length, "<main> has no text").toBeGreaterThan(0);
    expect(problems, problems.join("\n")).toEqual([]);
  });
}
