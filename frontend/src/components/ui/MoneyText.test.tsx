import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { formatMoney, groupLakh } from "../../lib/format";
import { usePrefsStore } from "../../lib/prefs";
import { MoneyText } from "./MoneyText";

describe("lakh grouping", () => {
  it.each([
    ["0", "0"],
    ["950", "950"],
    ["1000", "1,000"],
    ["120000", "1,20,000"],
    ["12500000", "1,25,00,000"],
  ])("%s -> %s", (input, expected) => {
    expect(groupLakh(input)).toBe(expected);
  });

  it("keeps decimals and a real minus sign", () => {
    expect(formatMoney(-1234.5, "en", { fraction: 2 })).toBe("−৳1,234.50");
  });
});

describe("MoneyText", () => {
  it("renders BDT with lakh grouping in English digits", () => {
    render(<MoneyText value={120000} />);
    expect(screen.getByText("৳1,20,000")).toBeInTheDocument();
  });

  it("follows the Bangla digit preference", () => {
    act(() => usePrefsStore.setState({ digits: "bn" }));
    render(<MoneyText value={120000} />);
    expect(screen.getByText("৳১,২০,০০০")).toBeInTheDocument();
  });

  it("lets a prop override the digit preference", () => {
    act(() => usePrefsStore.setState({ digits: "bn" }));
    render(<MoneyText value={2500} digits="en" />);
    expect(screen.getByText("৳2,500")).toBeInTheDocument();
  });

  it("compacts to lakh / লাখ by language", () => {
    const { rerender } = render(<MoneyText value={150000} compact />);
    expect(screen.getByText("৳1.5 lakh")).toBeInTheDocument();
    act(() => usePrefsStore.setState({ lang: "bn", digits: "bn" }));
    rerender(<MoneyText value={150000} compact />);
    expect(screen.getByText("৳১.৫ লাখ")).toBeInTheDocument();
  });

  it("signs positive values when asked", () => {
    render(<MoneyText value={4100} signed />);
    expect(screen.getByText("+৳4,100")).toBeInTheDocument();
  });
});
