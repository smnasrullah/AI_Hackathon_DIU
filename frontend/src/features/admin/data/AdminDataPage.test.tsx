import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useToastStore } from "../../../components/ui/toastStore";
import { api as realApi } from "../../../lib/api";
import type { FakeApi } from "../../../test/fakeApi";
import { signIn } from "../../auth/testUtils";
import { renderAt } from "../../distributor/testRender";
import { dataSummary, job } from "../testFixtures";
import { AdminDataPage } from "./AdminDataPage";
import { parseMarkdown } from "./markdown";

vi.mock("../../../lib/api", async () => {
  const { createFakeApi } = await import("../../../test/fakeApi");
  return { api: createFakeApi(), authClient: { post: vi.fn() }, refreshAccessToken: vi.fn() };
});

const api = realApi as unknown as FakeApi;
const DOC = "# Synthetic Data\n\nAll data is **synthetic**.\n\n| Item | Value |\n|---|---|\n| Seed | `42` |\n\n- one\n- two\n";

describe("synthetic data", () => {
  beforeEach(() => {
    api.reset();
    useToastStore.setState({ toasts: [] });
    signIn("admin");
    api.on("get", "/admin/data", () => dataSummary());
    api.on("get", "/admin/data/assumptions", () => ({ title: "Synthetic Data", markdown: DOC }));
  });

  it("parses headings, tables, lists and inline marks without HTML", () => {
    const blocks = parseMarkdown(DOC + "\n<script>alert(1)</script>\n");
    expect(blocks.map((b) => b.kind)).toEqual(["heading", "paragraph", "table", "list", "paragraph"]);
    const table = blocks[2];
    expect(table?.kind === "table" && table.rows[0]?.[1]).toEqual([{ kind: "code", text: "42" }]);
  });

  it("shows counts and the assumptions document as text", async () => {
    api.on("get", "/admin/jobs", () => ({ items: [], running: null }));
    renderAt("/admin/data", "/admin/data", <AdminDataPage />);
    const counts = await screen.findByTestId("data-counts");
    expect(await within(counts).findByText("10,36,800")).toBeInTheDocument();
    const doc = await screen.findByTestId("markdown-doc");
    expect(within(doc).getByRole("table")).toBeInTheDocument();
    expect(within(doc).getByText("synthetic").tagName).toBe("STRONG");
  });

  it("starts the generation job after confirming and shows its progress", async () => {
    let running = false;
    api.on("get", "/admin/jobs", () => (running ? { items: [job()], running: job() } : { items: [], running: null }));
    api.on("post", "/admin/jobs", () => {
      running = true;
      return job({ status: "queued", progress: 0, step: "queued" });
    });
    renderAt("/admin/data", "/admin/data", <AdminDataPage />);
    const start = await screen.findByTestId("start-generate_data");
    await waitFor(() => expect(start).toBeEnabled());
    fireEvent.click(start);
    fireEvent.click(await screen.findByRole("button", { name: "Regenerate" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/admin/jobs", { kind: "generate_data" }));
    const bar = await screen.findByRole("progressbar", { name: "Progress" });
    expect(bar).toHaveAttribute("aria-valuenow", "55");
    expect(screen.getByText("Refreshing caches")).toBeInTheDocument();
    expect(screen.getByTestId("start-generate_data")).toBeDisabled();
  });
});
