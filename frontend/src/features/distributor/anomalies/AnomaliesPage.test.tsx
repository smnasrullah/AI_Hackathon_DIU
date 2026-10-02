import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useToastStore } from "../../../components/ui/toastStore";
import { api as realApi } from "../../../lib/api";
import type { FakeApi } from "../../../test/fakeApi";
import { signIn } from "../../auth/testUtils";
import { anomalyDetail, anomalyItem, llmText } from "../testFixtures";
import { renderAt } from "../testRender";
import { AnomaliesPage } from "./AnomaliesPage";

vi.mock("../../../lib/api", async () => {
  const { createFakeApi } = await import("../../../test/fakeApi");
  return { api: createFakeApi(), authClient: { post: vi.fn() }, refreshAccessToken: vi.fn() };
});

vi.mock("../../../lib/useMediaQuery", () => ({ useMediaQuery: () => true }));

const api = realApi as unknown as FakeApi;

describe("anomalies", () => {
  beforeEach(() => {
    api.reset();
    useToastStore.setState({ toasts: [] });
    signIn("distributor");
    api.on("get", "/anomalies", () => ({ items: [anomalyItem({})], total: 1, page: 1, page_size: 20, advisory: true }));
    api.on("get", "/anomalies/3", () => anomalyDetail());
    api.on("get", "/anomalies/3/narrative", () => llmText({ intent: "anomaly_narrative", text: "Cash-out is well above similar shops this week." }));
    api.on("post", "/anomalies/3/review", (body) => anomalyDetail({ status: (body as { decision: "confirmed" | "dismissed" }).decision, note: (body as { note: string }).note }));
  });

  it("shows the peer comparison and the AI note beside the list", async () => {
    renderAt("/distributor/anomalies/3", "/distributor/anomalies/:id", <AnomaliesPage />);
    const detail = await screen.findByTestId("anomaly-detail");
    const chart = within(detail).getByTestId("peer-chart");
    expect(chart.querySelector('[data-feature="cash_out_growth"]')).toHaveAttribute("data-outside", "true");
    expect(chart.querySelector('[data-feature="refills_per_day"]')).toHaveAttribute("data-outside", "false");
    expect(await within(detail).findByText("Cash-out is well above similar shops this week.")).toBeInTheDocument();
    expect(within(detail).getByTestId("wording-chip")).toHaveAttribute("data-generated-by", "llm");
    expect(screen.getByTestId("anomaly-row")).toHaveAttribute("aria-current", "page");
    expect(api.get).toHaveBeenCalledWith("/anomalies", { params: { status: "open", page: 1, page_size: 20 } });
  });

  it("reviews with a required note", async () => {
    renderAt("/distributor/anomalies/3", "/distributor/anomalies/:id", <AnomaliesPage />);
    fireEvent.click(await screen.findByTestId("review-dismiss"));
    const confirm = await screen.findByRole("button", { name: "Dismiss flag" });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "Hat day in Savar" } });
    fireEvent.click(confirm);
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/anomalies/3/review", { decision: "dismissed", note: "Hat day in Savar" }));
    await waitFor(() => expect(useToastStore.getState().toasts.map((t) => t.title)).toContain("Flag dismissed"));
  });

  it("keeps the status filter in the URL", async () => {
    renderAt("/distributor/anomalies", "/distributor/anomalies", <AnomaliesPage />);
    await screen.findByTestId("anomaly-row");
    fireEvent.click(screen.getByRole("radio", { name: "All" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("status=all"));
    expect(api.get).toHaveBeenLastCalledWith("/anomalies", { params: { page: 1, page_size: 20 } });
  });
});
