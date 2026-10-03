import { describe, expect, it } from "vitest";

import type { HelpRequestItem } from "../../api/types";
import { attentionFor, awaitingMyAnswer, askedCount, helpMapPoints, helpNeededFor, hoursUntil, timelineStates } from "./helpModel";

const BASE: HelpRequestItem = {
  id: 7,
  view: "recipient",
  requester: { agent_id: 3, code: "AGT-0003", name: "Mirpur 10 Mobile Point", upazila: "Mirpur", district: "Dhaka" },
  float_type: "cash",
  amount_needed: 15000,
  needed_by: "2026-03-10T09:40:00Z",
  status: "open",
  wave_number: 1,
  created_by: "system",
  created_at: "2026-03-10T06:00:00Z",
  updated_at: "2026-03-10T06:00:00Z",
  claimed_at: null,
  claim_expires_at: null,
  fulfilled_at: null,
  my_response: "none",
  claimed_by_me: false,
  my_distance_km: 1.2,
  simulated: false,
  reason_summary: null,
  claimed_by: null,
  recipients: null,
  advisory: true,
  urgent: false,
  deadline_asap: false,
  reason_category: "unknown",
  can_confirm_late: false,
};

describe("timelineStates", () => {
  it("marks sent, accepted and received in order", () => {
    expect(timelineStates("open")).toEqual({ sent: "done", accepted: "current", received: "todo" });
    expect(timelineStates("claimed")).toEqual({ sent: "done", accepted: "done", received: "current" });
    expect(timelineStates("fulfilled")).toEqual({ sent: "done", accepted: "done", received: "done" });
  });

  it("stops after sent when the request ended unfilled or cancelled", () => {
    expect(timelineStates("expired")).toEqual({ sent: "done", accepted: "todo", received: "todo" });
    expect(timelineStates("cancelled")).toEqual({ sent: "done", accepted: "todo", received: "todo" });
  });
});

describe("attentionFor", () => {
  it("flags an unfilled expiry", () => {
    expect(attentionFor({ status: "expired", wave_number: 2 }, 3)).toBe("expired");
  });

  it("flags an open request that reached the last wave", () => {
    expect(attentionFor({ status: "open", wave_number: 3 }, 3)).toBe("lastWave");
    expect(attentionFor({ status: "open", wave_number: 2 }, 3)).toBeNull();
  });

  it("does not flag when the last wave is unknown", () => {
    expect(attentionFor({ status: "open", wave_number: 9 }, null)).toBeNull();
  });

  it("trusts the server's last-wave flag (distributors get it, agents do not)", () => {
    expect(attentionFor({ status: "open", wave_number: 2, is_last_wave: true })).toBe("lastWave");
    expect(attentionFor({ status: "open", wave_number: 2, is_last_wave: false })).toBeNull();
    expect(attentionFor({ status: "claimed", wave_number: 3, is_last_wave: true })).toBeNull();
    expect(attentionFor({ status: "open" })).toBeNull();
  });
});

describe("helpNeededFor", () => {
  it("keeps open requests I have not answered and the one I claimed", () => {
    const open = { ...BASE, id: 1 };
    const declined = { ...BASE, id: 2, my_response: "declined" as const };
    const claimed = { ...BASE, id: 3, status: "claimed" as const, my_response: "accepted" as const, claimed_by_me: true };
    const takenByOther = { ...BASE, id: 4, status: "claimed" as const, my_response: "superseded" as const };
    expect(helpNeededFor([open, declined, claimed, takenByOther]).map((i) => i.id)).toEqual([1, 3]);
  });

  it("treats a missing answer as not yet answered", () => {
    expect(awaitingMyAnswer({ my_response: null })).toBe(true);
    expect(awaitingMyAnswer({ my_response: "none" })).toBe(true);
    expect(awaitingMyAnswer({ my_response: "accepted" })).toBe(false);
  });
});

describe("countdown and counts", () => {
  it("returns hours until the deadline, negative once it has passed", () => {
    expect(hoursUntil("2026-03-10T09:40:00Z", new Date("2026-03-10T07:40:00Z"))).toBe(2);
    expect(hoursUntil("2026-03-10T09:40:00Z", new Date("2026-03-10T10:00:00Z"))).toBeLessThan(0);
  });

  it("counts askees without exposing names", () => {
    expect(askedCount({ recipients: null })).toBe(0);
    expect(askedCount({ recipients: [] })).toBe(0);
  });
});

describe("helpMapPoints", () => {
  it("places open requests at the requester shop and skips closed ones and unknown shops", () => {
    const shops = [{ agent_id: 3, lng: 90.36, lat: 23.8 }];
    const points = helpMapPoints(
      [BASE, { ...BASE, id: 8, status: "fulfilled" }, { ...BASE, id: 9, requester: { ...BASE.requester, agent_id: 99 } }],
      shops,
    );
    expect(points).toEqual([{ id: 7, name: "Mirpur 10 Mobile Point", amount: 15000, floatType: "cash", urgent: false, lng: 90.36, lat: 23.8 }]);
  });
});
