import { expect, test } from "@playwright/test";

import { loginAs } from "./helpers";

interface MapPayload {
  at_hour: number;
  agents: { agent_id: number; level: "green" | "amber" | "red" }[];
}

test("control room: the scrubber recolours dots and filters narrow the list", async ({ page }) => {
  const first = page.waitForResponse((res) => res.url().includes("/api/v1/map/agents?at_hour=0") && res.ok());
  await loginAs(page, "distributor");
  const start = (await (await first).json()) as MapPayload;
  const rows = page.getByTestId("agent-row");
  await expect(rows.first()).toBeVisible();
  const greens = start.agents.filter((a) => a.level === "green").length;
  await expect(page.getByTestId("kpi-green")).toHaveAttribute("data-count", String(greens));

  const later = page.waitForResponse((res) => res.url().includes("/api/v1/map/agents?at_hour=72") && res.ok());
  await page.getByTestId("time-scrubber").locator('input[type="range"]').fill("72");
  const end = (await (await later).json()) as MapPayload;
  await expect(page.getByTestId("control-room")).toHaveAttribute("data-hour", "72");

  const reds = end.agents.filter((a) => a.level === "red").length;
  await expect(page.getByTestId("kpi-red")).toHaveAttribute("data-count", String(reds));
  // The top row's dot carries the level the API gave that agent at +72h.
  const top = rows.first();
  const id = Number(await top.getAttribute("data-agent-id"));
  const level = end.agents.find((a) => a.agent_id === id)?.level ?? "missing";
  await expect(top.getByTestId("agent-dot")).toHaveAttribute("data-level", level);

  // Only "Act now": every visible dot is red (or the empty state when none is).
  await page.getByTestId("filter-amber").click();
  await page.getByTestId("filter-green").click();
  if (reds > 0) {
    const levels = await page.getByTestId("agent-dot").evaluateAll((els) => els.map((el) => el.getAttribute("data-level")));
    expect(new Set(levels)).toEqual(new Set(["red"]));
  } else {
    await expect(rows).toHaveCount(0);
  }
});

test("control room is distributor-only", async ({ page }) => {
  await loginAs(page, "agent");
  await page.goto("/distributor");
  await expect(page).toHaveURL(/\/403$/);
});
