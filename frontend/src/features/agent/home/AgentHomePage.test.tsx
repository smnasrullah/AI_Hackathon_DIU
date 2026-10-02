import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FloatType } from "../../../api/types";
import { api as realApi } from "../../../lib/api";
import { usePrefsStore } from "../../../lib/prefs";
import type { FakeApi } from "../../../test/fakeApi";
import { signIn } from "../../auth/testUtils";
import {
  AI_SENTENCE,
  EVENTS,
  EXPLANATION,
  NARRATION,
  NO_RECOMMENDATION,
  SUMMARY,
  TEMPLATE_SENTENCE,
  whatIf,
} from "../testFixtures";
import { AgentHomePage } from "./AgentHomePage";

vi.mock("../../../lib/api", async () => {
  const { createFakeApi } = await import("../../../test/fakeApi");
  return { api: createFakeApi(), authClient: { post: vi.fn() }, refreshAccessToken: vi.fn() };
});

const api = realApi as unknown as FakeApi;

function renderHome() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AgentHomePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("agent home", () => {
  let releaseNarration: () => void = () => undefined;

  beforeEach(() => {
    api.reset();
    signIn("agent");
    api.on("get", "/agents/1/summary", () => SUMMARY);
    api.on("post", "/agents/1/whatif", (body) => whatIf((body as { float_type: FloatType }).float_type));
    api.on("get", "/events", () => EVENTS);
    api.on("get", "/agents/1/explanations", () => EXPLANATION);
    api.on("get", "/agents/1/recommendation", () => NO_RECOMMENDATION);
    const gate = new Promise<void>((resolve) => {
      releaseNarration = resolve;
    });
    api.on("post", "/explanations/narrate", async () => {
      await gate;
      return NARRATION;
    });
  });

  it("flags the runway at the predicted stockout time with its confidence", async () => {
    renderHome();
    const flag = await screen.findByTestId("stockout-flag");
    expect(flag).toHaveTextContent("3:40 PM · 82%");
    // The countdown leads with the float that runs out first.
    expect(screen.getByText("Cash runs dry in 3h 40m")).toBeInTheDocument();
    // Read from the runway projection (what-if with no change), never invented client-side.
    expect(api.post).toHaveBeenCalledWith("/agents/1/whatif", { float_type: "cash", delta_amount: 0 });
  });

  it("shows the flag time in Bangla words and digits", async () => {
    act(() => usePrefsStore.setState({ lang: "bn", digits: "bn" }));
    renderHome();
    expect(await screen.findByTestId("stockout-flag")).toHaveTextContent("বিকেল ৩:৪০ · ৮২%");
  });

  it("shows template wording first, then fades in the AI wording with its chip", async () => {
    renderHome();
    const chip = await screen.findByTestId("wording-chip");
    expect(chip).toHaveAttribute("data-generated-by", "template");
    expect(chip.parentElement).toHaveTextContent(TEMPLATE_SENTENCE);

    act(() => releaseNarration());
    await waitFor(() => expect(screen.getByTestId("wording-chip")).toHaveAttribute("data-generated-by", "llm"));
    const block = screen.getByTestId("wording-chip").parentElement as HTMLElement;
    expect(within(block).getByText(AI_SENTENCE)).toBeInTheDocument();
    expect(within(block).getByText("AI-generated wording")).toBeInTheDocument();
    // The model chip stays separate from the wording chip.
    expect(screen.getByText("Model prediction")).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith("/explanations/narrate", { agent_id: 1, target: "cash", lang: "en" });
  });

  it("offers a next step when nothing needs doing", async () => {
    renderHome();
    expect(await screen.findByText("Nothing to do right now")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "See the forecast" })).toBeInTheDocument();
  });

  it("shows an error with retry when the summary fails", async () => {
    api.on("get", "/agents/1/summary", () => {
      throw new Error("boom");
    });
    renderHome();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
