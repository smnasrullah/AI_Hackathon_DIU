import { describe, expect, it } from "vitest";

import { policySchema, triggerSchema, type SettingsMessages } from "./helpSettingsSchema";

const MESSAGES: SettingsMessages = {
  number: "Enter a whole number.",
  range: (min, max) => `Enter a whole number from ${min} to ${max}.`,
};

const POLICY = {
  enabled: true,
  dry_run: false,
  claim_timeout_min: 30,
  cooldown_min: 60,
  daily_cap_per_agent: 3,
  max_recipients_per_wave: 5,
};

describe("policySchema", () => {
  it("accepts values inside the server bounds", () => {
    expect(policySchema(MESSAGES).safeParse(POLICY).success).toBe(true);
  });

  it("rejects a claim timeout above a day and says the range", () => {
    const result = policySchema(MESSAGES).safeParse({ ...POLICY, claim_timeout_min: 1441 });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe("Enter a whole number from 1 to 1440.");
  });

  it("rejects a fraction where a whole number of minutes is needed", () => {
    const result = policySchema(MESSAGES).safeParse({ ...POLICY, cooldown_min: 2.5 });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe("Enter a whole number.");
  });

  it("rejects an empty field (NaN from the number input)", () => {
    expect(policySchema(MESSAGES).safeParse({ ...POLICY, daily_cap_per_agent: Number.NaN }).success).toBe(false);
  });
});

describe("triggerSchema", () => {
  const TRIGGER = {
    horizon_h: 24,
    buffer_pct: 10,
    min_shortfall_bdt: 5000,
    max_request_bdt: 50000,
    lead_margin_h: 4,
    radius_km: 5,
    wave_timeout_min: 30,
    max_waves: 3,
    recent_ask_h: 6,
  };

  it("accepts the default-like settings", () => {
    expect(triggerSchema(MESSAGES).safeParse(TRIGGER).success).toBe(true);
  });

  it("keeps the search radius above zero and at most 50 km", () => {
    expect(triggerSchema(MESSAGES).safeParse({ ...TRIGGER, radius_km: 0 }).success).toBe(false);
    expect(triggerSchema(MESSAGES).safeParse({ ...TRIGGER, radius_km: 50.5 }).success).toBe(false);
  });

  it("allows a fractional buffer percentage", () => {
    expect(triggerSchema(MESSAGES).safeParse({ ...TRIGGER, buffer_pct: 12.5 }).success).toBe(true);
  });

  it("limits the number of waves to 10", () => {
    expect(triggerSchema(MESSAGES).safeParse({ ...TRIGGER, max_waves: 11 }).success).toBe(false);
  });
});
