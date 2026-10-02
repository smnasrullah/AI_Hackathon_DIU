import { expect, test } from "@playwright/test";

import { dismissTour, hasHorizontalScroll, pathOf, watchPage } from "./helpers";

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
];

for (const vp of VIEWPORTS) {
  test.describe(`${vp.name} ${vp.width}px`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test("landing renders hero, story, role cards and notices", async ({ page }) => {
      const { problems } = watchPage(page);
      await page.goto("/");
      await expect(page.getByTestId("landing")).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByTestId("hero-runway")).toBeVisible();
      await expect(page.locator("#how")).toBeAttached();
      await expect(page.getByTestId("demo-login-agent")).toBeVisible();
      await expect(page.getByTestId("demo-login-distributor")).toBeVisible();
      await expect(page.locator("footer")).toContainText(/Synthetic data only|শুধু কৃত্রিম ডেটা/);
      expect(await hasHorizontalScroll(page)).toBe(false);
      expect(problems, problems.join("\n")).toEqual([]);
    });

    test("login renders the split form", async ({ page }) => {
      const { problems } = watchPage(page);
      await page.goto("/login");
      await expect(page.locator("#email")).toBeVisible();
      await expect(page.locator("#password")).toBeVisible();
      await expect(page.getByTestId("login-submit")).toBeEnabled();
      await expect(page.getByTestId("demo-chip-agent")).toBeVisible();
      expect(await hasHorizontalScroll(page)).toBe(false);
      expect(problems, problems.join("\n")).toEqual([]);
    });
  });
}

test("scrubbing the runway past the stockout updates the headline", async ({ page }) => {
  await page.goto("/");
  const headline = page.getByRole("heading", { level: 1 });
  await expect(headline).toContainText(/Cash may run out|ক্যাশ শেষ হতে পারে/);
  // Keyboard scrubbing (also the accessible path): End jumps to closing time.
  await page.getByTestId("hero-scrub").focus();
  await page.keyboard.press("End");
  await expect(headline).toContainText(/Cash ran out|ক্যাশ শেষ হয়ে গেছে/);
});

test("empty login shows inline errors and does not navigate", async ({ page }) => {
  await page.goto("/login");
  await page.getByTestId("login-submit").click();
  await expect(page.locator("#email")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#password")).toHaveAttribute("aria-invalid", "true");
  expect(pathOf(page)).toBe("/login");
});

test("demo login from a landing role card lands on the agent home", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("demo-login-agent").click();
  await expect(page).toHaveURL((url) => url.pathname === "/agent");
  await dismissTour(page);
  await expect(page.getByTestId("avatar-menu")).toBeVisible();
});

test("demo chip on the login page signs in as distributor", async ({ page }) => {
  await page.goto("/login");
  await page.getByTestId("demo-chip-distributor").click();
  await expect(page).toHaveURL((url) => url.pathname === "/distributor");
  await dismissTour(page);
});

test("signed-in visitors skip the landing", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("demo-login-admin").click();
  await expect(page).toHaveURL((url) => url.pathname === "/admin");
  await dismissTour(page);
  await page.goto("/");
  await expect(page).toHaveURL((url) => url.pathname === "/admin");
});
