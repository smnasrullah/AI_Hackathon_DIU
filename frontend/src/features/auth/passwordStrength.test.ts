import { describe, expect, it } from "vitest";

import { passwordStrength } from "./passwordStrength";

describe("passwordStrength", () => {
  it("rates by length and character variety", () => {
    expect(passwordStrength("short1")).toBe("weak");
    expect(passwordStrength("abcdefgh")).toBe("fair");
    expect(passwordStrength("abcdEFG1")).toBe("good");
    expect(passwordStrength("abcdEFG1!xyz2026")).toBe("strong");
  });
});
