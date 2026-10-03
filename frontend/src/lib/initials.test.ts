import { describe, expect, it } from "vitest";

import { firstLetter, getInitials } from "./initials";

describe("getInitials", () => {
  it.each([
    ["ক্ষমা রহমান", "ক্ষর"], // conjunct ক্ষ stays whole
    ["কামাল", "কা"], // vowel sign stays with its consonant
    ["ষ্ট্রিট", "ষ্ট্রি"], // two viramas + vowel sign in one initial
    ["Rahim Uddin", "RU"],
    ["rahim", "R"],
    ["  Rahim   Uddin   Khan  ", "RK"], // extra spaces; first + last word
    ["Rahim উদ্দিন", "Rউ"], // mixed scripts
    ["  ", "?"],
    ["", "?"],
  ])("%j -> %j", (name, expected) => {
    expect(getInitials(name)).toBe(expected);
  });

  it("returns ? for null and undefined", () => {
    expect(getInitials(null)).toBe("?");
    expect(getInitials(undefined)).toBe("?");
  });
});

describe("firstLetter fallback when the engine splits a conjunct at the virama", () => {
  it("rebuilds the conjunct from code points", () => {
    // Simulate an engine without Segmenter: the code-point path must still join ক্ষ.
    const saved = Intl.Segmenter;
    Reflect.deleteProperty(Intl, "Segmenter");
    try {
      expect("Segmenter" in Intl).toBe(false);
      expect(firstLetter("ক্ষমা")).toBe("ক্ষ");
      expect(firstLetter("ষ্ট্রিট")).toBe("ষ্ট্রি");
      expect(firstLetter("কামাল")).toBe("কা");
    } finally {
      Object.assign(Intl, { Segmenter: saved });
    }
  });
});
