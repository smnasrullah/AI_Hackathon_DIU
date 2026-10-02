import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WhatIfIn, WhatIfOut } from "../../../api/types";
import { api as realApi } from "../../../lib/api";
import type { FakeApi } from "../../../test/fakeApi";
import { signIn } from "../../auth/testUtils";
import { whatIf } from "../testFixtures";
import { WhatIfPage } from "./WhatIfPage";
import { resultKind, sliderBounds } from "./whatIfModel";

vi.mock("../../../lib/api", async () => {
  const { createFakeApi } = await import("../../../test/fakeApi");
  return { api: createFakeApi(), authClient: { post: vi.fn() }, refreshAccessToken: vi.fn() };
});

const api = realApi as unknown as FakeApi;

/** Backend stand-in: any top-up keeps cash going past 72 h. */
function answer(body: WhatIfIn): WhatIfOut {
  const out = whatIf(body.float_type);
  if (body.delta_amount === 0) return out;
  const after = { ...out.before, balance: out.before.balance + body.delta_amount, stockout_at: null, hours_to_stockout: null, level: "green" as const };
  return { ...out, delta_amount: body.delta_amount, after };
}

function postedDeltas(): number[] {
  return api.post.mock.calls.map((c) => (c[1] as WhatIfIn).delta_amount).filter((d) => d !== 0);
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/agent/what-if"]}>
        <WhatIfPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("what-if page", () => {
  beforeEach(() => {
    api.reset();
    signIn("agent");
    api.on("post", "/agents/1/whatif", (body) => answer(body as WhatIfIn));
  });

  it("asks the backend once, 300 ms after the slider settles, then states the result", async () => {
    renderPage();
    const slider = await screen.findByRole("slider");
    expect(screen.getByTestId("whatif-result")).toHaveTextContent("Move the slider");

    fireEvent.change(slider, { target: { value: "5000" } });
    fireEvent.change(slider, { target: { value: "10000" } });
    fireEvent.change(slider, { target: { value: "20000" } });
    // The vessel follows at once; the backend has not been asked yet.
    expect(screen.getByTestId("whatif-delta")).toHaveTextContent("20,000");
    expect(postedDeltas()).toEqual([]);

    await waitFor(() => expect(postedDeltas()).toEqual([20000]));
    await waitFor(() =>
      expect(screen.getByTestId("whatif-result")).toHaveTextContent("lasts the next 72 hours instead of running out 10 Mar, 3:40 PM"),
    );
    await new Promise((r) => setTimeout(r, 350));
    expect(postedDeltas()).toEqual([20000]);
  });

  it("shows an error with retry when the runway fails", async () => {
    api.on("post", "/agents/1/whatif", () => {
      throw new Error("boom");
    });
    renderPage();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});

describe("what-if model", () => {
  it("keeps the slider inside what the backend accepts, with 0 reachable", () => {
    expect(sliderBounds(18_250, 150_000)).toEqual({ min: -18_000, max: 131_500 });
    expect(sliderBounds(160_000, 150_000)).toEqual({ min: -160_000, max: 0 });
  });

  it("names how the stockout moved", () => {
    expect(resultKind({ hours_to_stockout: 3 }, { hours_to_stockout: null })).toBe("nowLasts");
    expect(resultKind({ hours_to_stockout: 3 }, { hours_to_stockout: 9 })).toBe("later");
    expect(resultKind({ hours_to_stockout: 9 }, { hours_to_stockout: 3 })).toBe("earlier");
    expect(resultKind({ hours_to_stockout: null }, { hours_to_stockout: 30 })).toBe("nowRunsOut");
    expect(resultKind({ hours_to_stockout: null }, { hours_to_stockout: null })).toBe("lasts");
  });
});
