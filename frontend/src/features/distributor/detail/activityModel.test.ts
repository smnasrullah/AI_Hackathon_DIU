import { describe, expect, it } from "vitest";

import type { AnomalyItem, RequestItem, SwapItem } from "../../../api/types";
import { agentActivity } from "./activityModel";
import { anomalyItem, requestItem, swapItem } from "../testFixtures";

describe("agent activity", () => {
  it("merges this agent's requests, swaps and flags with their decisions, newest first", () => {
    const requests: RequestItem[] = [requestItem({ id: 1, created_at: "2026-03-10T08:00:00Z", decided_at: "2026-03-10T09:00:00Z", status: "approved", note: "Van at 10" })];
    const elsewhere = { code: "A009", name: "Other", response: null, upazila: null };
    const swaps: SwapItem[] = [
      swapItem({ id: 7, generated_at: "2026-03-10T07:00:00Z" }),
      swapItem({ id: 8, donor: { ...elsewhere, agent_id: 5 }, receiver: { ...elsewhere, agent_id: 9 } }),
    ];
    const anomalies: AnomalyItem[] = [anomalyItem({ id: 3, generated_at: "2026-03-09T12:00:00Z", reviewed_at: "2026-03-10T10:00:00Z", status: "dismissed", note: "Hat day" })];

    const out = agentActivity(1, requests, swaps, anomalies);
    expect(out.map((e) => e.event)).toEqual(["anomaly_dismissed", "request_approved", "request_requested", "swap_gives", "anomaly_flagged"]);
    expect(out[0]?.note).toBe("Hat day");
    expect(out[3]?.partner).toBe("Rahim Store");
  });

  it("is empty for an agent with nothing on record", () => {
    expect(agentActivity(42, [requestItem({})], [swapItem({})], [anomalyItem({})])).toEqual([]);
  });
});
