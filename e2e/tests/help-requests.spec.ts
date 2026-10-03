import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

import { ACCOUNTS, dismissTour, fillLogin } from "./helpers";

// Demo agents (seeded, shared agent password). AGT-0001 is short. Helpers must share its
// distributor (DST-DHK) and be able to cover the whole request alone: the helper logins of
// backend/app/services/seed.py HELPER_USERS. Agents of other distributors are never asked. Which
// of them wave 1 asks depends on the fairness rotation (earlier runs count), so the test looks.
const REQUESTER = "agent.mirpur@agentpulse.demo";
const HELPERS = [
  "agent.mirpur11@agentpulse.demo",
  "agent.mirpur.chowdhury@agentpulse.demo",
  "agent.mirpur.sarkar@agentpulse.demo",
  "agent.mohammadpur@agentpulse.demo",
];
const SHORT_AGENT_CODE = "AGT-0001";
const SHORT_AGENT_NAME = "Mirpur 10 Mobile Point";

/** A fresh browser session (its own cookies) signed in as one account. */
async function signIn(browser: Browser, email: string, password: string, home: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await fillLogin(page, email, password);
  await expect(page).toHaveURL((url) => url.pathname === home);
  await dismissTour(page);
  return page;
}

const byShop = (page: Page): Locator => page.locator('[data-testid^="help-needed-"]', { hasText: SHORT_AGENT_NAME });

/** The first helper login that sees a matching open request, signed in on /agent/help. */
async function askedHelper(browser: Browser, password: string, match: (page: Page) => Locator, skip: string[] = []): Promise<{ email: string; page: Page } | null> {
  for (const email of HELPERS.filter((h) => !skip.includes(h))) {
    const page = await signIn(browser, email, password, "/agent");
    await page.goto("/agent/help");
    // Settled: either the cards that need an answer or the "nothing to answer" state.
    await expect(page.locator('[data-testid^="help-needed-"]').first()).toBeVisible({ timeout: 60_000 });
    if ((await match(page).count()) > 0) return { email, page };
    await page.context().close();
  }
  return null;
}

test.describe("liquidity help request story", () => {
  test.use({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });

  test("shortage is simulated, one helper accepts, the other sees it covered, the requester confirms, status fulfilled", async ({ browser }) => {
    test.setTimeout(240_000);

    // 1. Admin resets the demo help state (repeatable runs, no database reset), then simulates a
    //    shortage for the short agent (DEMO_MODE only).
    const admin = await signIn(browser, ACCOUNTS.admin.email, ACCOUNTS.admin.password, "/admin");
    await admin.goto("/admin/help-settings");
    await admin.getByTestId("demo-reset").click();
    await admin.getByRole("dialog").getByRole("button", { name: "Reset demo help-request state" }).click();
    await expect(admin.getByRole("dialog")).toHaveCount(0, { timeout: 30_000 });
    const picker = admin.getByTestId("demo-agent");
    await expect(picker).toBeVisible();
    const shortValue = await picker.locator("option", { hasText: SHORT_AGENT_CODE }).getAttribute("value");
    if (!shortValue) throw new Error(`no picker option for ${SHORT_AGENT_CODE}`);
    await picker.selectOption(shortValue);
    await admin.getByTestId("demo-simulate").click();
    await expect(admin.getByTestId("demo-result")).toContainText("request(s) created", { timeout: 60_000 });

    // 2. A helper that was asked sees the request and accepts it; the next step is shown.
    const first = await askedHelper(browser, ACCOUNTS.agent.password, byShop);
    if (!first) throw new Error("no helper login was asked in wave 1");
    const helperA = first.page;
    // Automatic requests from other shops may also be listed: take AGT-0001's.
    const helperCard = helperA.locator('[data-testid^="help-needed-"]', { hasText: SHORT_AGENT_NAME }).first();
    await expect(helperCard).toBeVisible({ timeout: 60_000 });
    const cardId = await helperCard.getAttribute("data-testid");
    if (!cardId) throw new Error("help card has no test id");
    const requestId = cardId.replace("help-needed-", "");
    await helperCard.getByTestId("help-claim").click();
    await expect(helperA.getByTestId("help-next-step")).toBeVisible({ timeout: 30_000 });
    await expect(helperA.getByTestId("help-withdraw")).toBeVisible();

    // 3. No other helper still sees the same request as open to answer (covered by helper A).
    expect(await askedHelper(browser, ACCOUNTS.agent.password, (page) => page.getByTestId(cardId), [first.email])).toBeNull();

    // 4. The requester sees the request has been accepted and confirms the money arrived.
    const requester = await signIn(browser, REQUESTER, ACCOUNTS.agent.password, "/agent");
    await requester.goto("/agent/help");
    const mine = requester.locator(`[data-request-id="${requestId}"]`);
    await expect(mine).toHaveAttribute("data-status", "claimed", { timeout: 60_000 });
    await mine.getByTestId("help-received").click();
    // Fulfilled requests leave the active list.
    await expect(requester.locator(`[data-request-id="${requestId}"]`)).toHaveCount(0, { timeout: 30_000 });

    // 5. The distributor sees the request fulfilled, with the timeline complete.
    const distributor = await signIn(browser, ACCOUNTS.distributor.email, ACCOUNTS.distributor.password, "/distributor");
    await distributor.goto(`/distributor/help-requests/${requestId}`);
    await expect(distributor.locator('[data-step="received"]')).toHaveAttribute("data-state", "done", { timeout: 60_000 });
    await expect(distributor.locator('[data-step="accepted"]')).toHaveAttribute("data-state", "done");
  });
});
