import { describe, expect, it } from "vitest";

import { digitRuns } from "./textRuns";

// Bengali combining marks: a text node starting with one renders a dotted circle (◌).
const LEADING_MARK = /^[ঁ-ঃ়া-ৄেৈো-্ৗৢৣ]/u;

describe("digitRuns", () => {
  it("keeps Bangla words whole and splits only digits", () => {
    const runs = digitRuns("২৩ ঘণ্টা ৩৫ মিনিট");
    expect(runs).toEqual([
      { text: "২", digit: true },
      { text: "৩", digit: true },
      { text: " ঘণ্টা ", digit: false },
      { text: "৩", digit: true },
      { text: "৫", digit: true },
      { text: " মিনিট", digit: false },
    ]);
    expect(runs.map((r) => r.text).join("")).toBe("২৩ ঘণ্টা ৩৫ মিনিট");
  });

  it.each(["২৩ ঘণ্টা ৩৫ মিনিট পর", "ক্ষুদ্র ৫ঘ ১২মি", "5h 20m", "৪০৪", "স্টক-আউট ৭২ ঘণ্টায়"])(
    "never starts a run with a combining mark: %s",
    (text) => {
      for (const run of digitRuns(text)) expect(run.text).not.toMatch(LEADING_MARK);
    },
  );
});
