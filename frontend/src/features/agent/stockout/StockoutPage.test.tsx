import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api as realApi } from "../../../lib/api";
import { usePrefsStore } from "../../../lib/prefs";
import type { FakeApi } from "../../../test/fakeApi";
import { signIn } from "../../auth/testUtils";
import { HORIZONS, SUMMARY } from "../testFixtures";
import { HorizonLadder } from "./HorizonLadder";
import { StockoutPage } from "./StockoutPage";

vi.mock("../../../lib/api", async () => {
  const { createFakeApi } = await import("../../../test/fakeApi");
  return { api: createFakeApi(), authClient: { post: vi.fn() }, refreshAccessToken: vi.fn() };
});

const api = realApi as unknown as FakeApi;

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <StockoutPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// Colour classes, lucide icon and word for each level (DESIGN.md §1: never colour alone).
const EXPECT = {
  red: { fg: "text-act-fg", bar: "bg-act", icon: "lucide-siren", en: "Act now", bn: "এখনই করুন" },
  amber: { fg: "text-watch-fg", bar: "bg-watch", icon: "lucide-eye", en: "Watch", bn: "নজরে রাখুন" },
  green: { fg: "text-safe-fg", bar: "bg-safe", icon: "lucide-shield-check", en: "Safe", bn: "নিরাপদ" },
} as const;

describe("risk ladder", () => {
  it.each(HORIZONS.map((h) => [h.horizon_h, h.level] as const))("%ih window shows %s as colour, icon and word", (hours, level) => {
    render(<HorizonLadder horizons={HORIZONS} />);
    const row = screen.getByTestId(`horizon-${hours}`);
    const want = EXPECT[level];
    expect(row).toHaveAttribute("data-level", level);
    const pill = within(row).getByText(want.en);
    expect(pill).toHaveClass(want.fg);
    expect(within(row).getByTestId("risk-icon")).toHaveClass(want.icon);
    expect(within(row).getByTestId("horizon-bar")).toHaveClass(want.bar);
    expect(row).toHaveTextContent(`Next ${hours} hours`);
  });

  it("uses the Bangla risk words and digits", () => {
    act(() => usePrefsStore.setState({ lang: "bn", digits: "bn" }));
    render(<HorizonLadder horizons={HORIZONS} />);
    expect(within(screen.getByTestId("horizon-6")).getByText(EXPECT.red.bn)).toBeInTheDocument();
    expect(within(screen.getByTestId("horizon-24")).getByText(EXPECT.amber.bn)).toBeInTheDocument();
    expect(within(screen.getByTestId("horizon-72")).getByText(EXPECT.green.bn)).toBeInTheDocument();
    expect(screen.getByTestId("horizon-6")).toHaveTextContent("পরের ৬ ঘণ্টা");
    expect(screen.getByTestId("horizon-6")).toHaveTextContent("৮২%");
  });
});

describe("stockout page", () => {
  beforeEach(() => {
    api.reset();
    signIn("agent");
    api.on("get", "/agents/1/summary", () => SUMMARY);
  });

  it("shows when each float could run out, cash first", async () => {
    renderPage();
    const cash = await screen.findByTestId("stockout-cash");
    expect(within(cash).getByTestId("stockout-time")).toHaveTextContent("Around 10 Mar, 3:40 PM");
    expect(cash).toHaveTextContent("in 3h 40m");
    expect(within(screen.getByTestId("stockout-emoney")).getByText("Not expected in the next 72 hours")).toBeInTheDocument();
    const cards = screen.getAllByTestId(/^stockout-(cash|emoney)$/);
    expect(cards.map((c) => c.dataset.testid)).toEqual(["stockout-cash", "stockout-emoney"]);
  });

  it("shows an error with retry when the summary fails", async () => {
    api.on("get", "/agents/1/summary", () => {
      throw new Error("boom");
    });
    renderPage();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
