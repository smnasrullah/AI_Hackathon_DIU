import { act, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { usePrefsStore } from "../../lib/prefs";
import { CountdownCard } from "./CountdownCard";

const LEADING_MARK = /^[ঁ-ঃ়া-ৄেৈো-্ৗৢৣ]/u;

function textNodes(root: Node): string[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const out: string[] = [];
  while (walker.nextNode()) out.push(walker.currentNode.textContent ?? "");
  return out;
}

describe("CountdownCard Bangla headline", () => {
  it("never splits a Bangla glyph cluster and drops letter-spacing", () => {
    act(() => usePrefsStore.setState({ lang: "bn", digits: "bn" }));
    const { container } = render(<CountdownCard floatType="cash" hoursToStockout={23 + 35 / 60} confidence={0.8} level="red" />);
    const headline = container.querySelector("p[lang='bn']");
    expect(headline).not.toBeNull();
    expect(headline?.textContent).toContain("ঘণ্টা");
    expect(headline?.className).not.toMatch(/tracking-/);
    for (const text of textNodes(headline as Node)) expect(text).not.toMatch(LEADING_MARK);
    // The unit word is one node, not one span per code point.
    expect(textNodes(headline as Node)).toContain(" ঘণ্টা ");
  });
});
