import { expect, test, type Browser, type Page } from "@playwright/test";

import { ACCOUNTS, dismissTour, fillLogin } from "./helpers";

// Demo agents (seeded, shared agent password). AGT-0001 is short. Helpers must share its
// distributor (DST-DHK) and be able to cover the whole default-size request alone: AGT-0004 and
// AGT-0064 (backend/app/services/seed.py HELPER_USERS). Agents of other distributors are never asked.
const REQUESTER = "agent.mirpur@agentpulse.demo";
const HELPER_A = "agent.mirpur11@agentpulse.demo";
const HELPER_B = "agent.mirpur.sarkar@agentpulse.demo";
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

test.describe("liquidity help request story", () => {
  test.use({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });

  test("shortage is simulated, one helper accepts, the other sees it covered, the requester confirms, status fulfilled", async ({ browser }) => {
    test.setTimeout(240_000);

    // 1. Admin simulates a shortage for the short agent (DEMO_MODE only).
    const admin = await signIn(browser, ACCOUNTS.admin.email, ACCOUNTS.admin.password, "/admin");
    await admin.goto("/admin/help-settings");
    const picker = admin.getByTestId("demo-agent");
    await expect(picker).toBeVisible();
    const shortValue = await picker.locator("option", { hasText: SHORT_AGENT_CODE }).getAttribute("value");
    if (!shortValue) throw new Error(`no picker option for ${SHORT_AGENT_CODE}`);
    await picker.selectOption(shortValue);
    await admin.getByTestId("demo-simulate").click();
    await expect(admin.getByTestId("demo-result")).toBeVisible({ timeout: 60_000 });

    // 2. Helper A sees the request and accepts it; the next step is shown.
    const helperA = await signIn(browser, HELPER_A, ACCOUNTS.agent.password, "/agent");
    await helperA.goto("/agent/help");
    // Automatic requests from other shops may also be listed: take AGT-0001's.
    const helperCard = helperA.locator('[data-testid^="help-needed-"]', { hasText: SHORT_AGENT_NAME }).first();
    await expect(helperCard).toBeVisible({ timeout: 60_000 });
    const cardId = await helperCard.getAttribute("data-testid");
    if (!cardId) throw new Error("help card has no test id");
    const requestId = cardId.replace("help-needed-", "");
    await helperCard.getByTestId("help-claim").click();
    await expect(helperA.getByTestId("help-next-step")).toBeVisible({ timeout: 30_000 });
    await expect(helperA.getByTestId("help-withdraw")).toBeVisible();

    // 3. Helper B no longer sees the same request as open to answer (covered by helper A).
    const helperB = await signIn(browser, HELPER_B, ACCOUNTS.agent.password, "/agent");
    await helperB.goto("/agent/help");
    // Wait for the list to settle (skeletons gone) before asserting the request is absent.
    await expect(helperB.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 60_000 });
    await expect(helperB.getByTestId(cardId)).toHaveCount(0);

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
