import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { usePrefsStore } from "../../lib/prefs";
import { RiskPill } from "./RiskPill";

describe("RiskPill", () => {
  it.each([
    ["green", "Safe"],
    ["amber", "Watch"],
    ["red", "Act now"],
  ] as const)("%s shows colour, icon and the word %s", (level, word) => {
    const { container } = render(<RiskPill level={level} />);
    const pill = container.firstElementChild;
    expect(pill).toHaveAttribute("data-level", level);
    expect(screen.getByText(word)).toBeInTheDocument();
    expect(screen.getByTestId("risk-icon")).toBeInTheDocument();
  });

  it("pulses the icon only for Act now", () => {
    const { rerender } = render(<RiskPill level="red" />);
    expect(screen.getByTestId("risk-icon").getAttribute("class")).toContain("ap-risk-pulse");
    for (const level of ["green", "amber"] as const) {
      rerender(<RiskPill level={level} />);
      expect(screen.getByTestId("risk-icon").getAttribute("class")).not.toContain("ap-risk-pulse");
    }
  });

  it("uses the Bangla words", () => {
    act(() => usePrefsStore.setState({ lang: "bn" }));
    render(
      <>
        <RiskPill level="green" />
        <RiskPill level="amber" />
        <RiskPill level="red" />
      </>,
    );
    expect(screen.getByText("নিরাপদ")).toBeInTheDocument();
    expect(screen.getByText("নজরে রাখুন")).toBeInTheDocument();
    expect(screen.getByText("এখনই করুন")).toBeInTheDocument();
  });
});
