import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useToastStore } from "../../../components/ui/toastStore";
import { api as realApi } from "../../../lib/api";
import { downloadFile } from "../../../lib/download";
import type { FakeApi } from "../../../test/fakeApi";
import { signIn } from "../../auth/testUtils";
import { renderAt } from "../../distributor/testRender";
import { auditItem } from "../testFixtures";
import { AuditLogPage } from "./AuditLogPage";
import { auditQuery, prettyPayload } from "./auditModel";

vi.mock("../../../lib/api", async () => {
  const { createFakeApi } = await import("../../../test/fakeApi");
  return { api: createFakeApi(), authClient: { post: vi.fn() }, refreshAccessToken: vi.fn() };
});
vi.mock("../../../lib/download", () => ({ downloadFile: vi.fn(async () => undefined) }));

const api = realApi as unknown as FakeApi;

describe("audit log", () => {
  beforeEach(() => {
    api.reset();
    vi.mocked(downloadFile).mockClear();
    useToastStore.setState({ toasts: [] });
    signIn("admin");
    api.on("get", "/admin/audit-log", () => ({
      items: [auditItem({ note: "Hat day in Savar" })],
      total: 1,
      page: 1,
      page_size: 50,
      actions: ["swap.approved", "user.create"],
      entity_types: ["swap", "user"],
    }));
  });

  it("maps Dhaka days to an inclusive UTC window", () => {
    expect(auditQuery({ action: "", entity: "", user: "", from: "2026-04-30", to: "2026-04-30" })).toEqual({
      from: "2026-04-30T00:00:00+06:00",
      to: "2026-05-01T00:00:00+06:00",
    });
    expect(prettyPayload('{"a":1}')).toBe('{\n  "a": 1\n}');
    expect(prettyPayload("not json")).toBe("not json");
  });

  it("filters by action, expands a row and exports the same filter", async () => {
    renderAt("/admin/audit-log", "/admin/audit-log", <AuditLogPage />);
    await screen.findByText("Hat day in Savar");
    fireEvent.change(screen.getByLabelText("Action"), { target: { value: "user.create" } });
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("action=user.create"));
    expect(api.get).toHaveBeenLastCalledWith("/admin/audit-log", { params: { action: "user.create", page: 1, page_size: 50 } });

    fireEvent.click(screen.getByText("user.create", { selector: "td span" }));
    expect(await screen.findByTestId("audit-payload")).toHaveTextContent('"role": "agent"');

    fireEvent.click(screen.getByTestId("audit-export"));
    await waitFor(() => expect(downloadFile).toHaveBeenCalledWith("/admin/audit-log/export.csv", { action: "user.create" }, "audit-log.csv"));
    await waitFor(() => expect(useToastStore.getState().toasts.map((t) => t.title)).toContain("CSV downloaded"));
  });
});
