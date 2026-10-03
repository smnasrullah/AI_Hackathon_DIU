import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useToastStore } from "../../../components/ui/toastStore";
import { api as realApi } from "../../../lib/api";
import type { FakeApi } from "../../../test/fakeApi";
import { signIn } from "../../auth/testUtils";
import { renderAt } from "../../distributor/testRender";
import { eventItem } from "../testFixtures";
import { AdminEventsPage } from "./AdminEventsPage";
import { fromDhakaInput, toDhakaInput } from "./eventForm";

vi.mock("../../../lib/api", async () => {
  const { createFakeApi } = await import("../../../test/fakeApi");
  return { api: createFakeApi(), authClient: { post: vi.fn() }, refreshAccessToken: vi.fn() };
});

const api = realApi as unknown as FakeApi;
const toasts = () => useToastStore.getState().toasts.map((t) => t.title);

describe("admin events", () => {
  beforeEach(() => {
    api.reset();
    useToastStore.setState({ toasts: [] });
    signIn("admin");
    api.on("get", "/events", () => ({ items: [eventItem()], total: 1, page: 1, page_size: 20 }));
  });

  it("converts Dhaka wall time both ways", () => {
    expect(toDhakaInput("2026-04-28T04:00:00Z")).toBe("2026-04-28T10:00");
    expect(fromDhakaInput("2026-04-28T10:00")).toBe("2026-04-28T10:00:00+06:00");
  });

  it("adds an event in Dhaka time and validates the window", async () => {
    api.on("post", "/events", () => eventItem({ id: 8 }));
    renderAt("/admin/events", "/admin/events", <AdminEventsPage />);
    await screen.findByText("Dhaka weekly hat");
    fireEvent.click(screen.getByTestId("add-event"));
    const form = await screen.findByTestId("event-form");
    fireEvent.change(within(form).getByLabelText("Type"), { target: { value: "eid" } });
    fireEvent.change(within(form).getByLabelText("Name (English)"), { target: { value: "Eid-ul-Adha" } });
    fireEvent.change(within(form).getByLabelText("Name (Bangla)"), { target: { value: "ঈদুল আযহা" } });
    fireEvent.change(within(form).getByLabelText("Starts (Dhaka time)"), { target: { value: "2026-05-26T00:00" } });
    fireEvent.change(within(form).getByLabelText("Ends (Dhaka time)"), { target: { value: "2026-05-25T00:00" } });
    fireEvent.change(within(form).getByLabelText("Intensity"), { target: { value: "2.3" } });
    fireEvent.click(within(form).getByRole("button", { name: "Add event" }));
    expect(await within(form).findByText("The end must be after the start.")).toBeInTheDocument();
    fireEvent.change(within(form).getByLabelText("Ends (Dhaka time)"), { target: { value: "2026-05-29T00:00" } });
    fireEvent.click(within(form).getByRole("button", { name: "Add event" }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/events", {
        type: "eid",
        name_en: "Eid-ul-Adha",
        name_bn: "ঈদুল আযহা",
        starts_at: "2026-05-26T00:00:00+06:00",
        ends_at: "2026-05-29T00:00:00+06:00",
        district: null,
        intensity: 2.3,
      }),
    );
    await waitFor(() => expect(toasts()).toContain("Event added"));
  });

  it("edits with the stored values and deletes after confirming", async () => {
    api.on("put", "/events/7", (body) => ({ ...eventItem(), ...(body as object) }));
    api.on("delete", "/events/7", () => undefined);
    renderAt("/admin/events", "/admin/events", <AdminEventsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit: Dhaka weekly hat" }));
    const form = await screen.findByTestId("event-form");
    expect(within(form).getByLabelText("Starts (Dhaka time)")).toHaveValue("2026-04-28T10:00");
    expect(within(form).getByLabelText("District")).toHaveValue("Dhaka");
    fireEvent.change(within(form).getByLabelText("Intensity"), { target: { value: "1.6" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith("/events/7", expect.objectContaining({ intensity: 1.6, district: "Dhaka" })));
    await waitFor(() => expect(toasts()).toContain("Event saved"));

    fireEvent.click(screen.getByRole("button", { name: "Delete: Dhaka weekly hat" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/events/7"));
    await waitFor(() => expect(toasts()).toContain("Event deleted"));
  });

  it("filters by type through the URL", async () => {
    renderAt("/admin/events", "/admin/events", <AdminEventsPage />);
    await screen.findByText("Dhaka weekly hat");
    fireEvent.change(screen.getByLabelText("Event type"), { target: { value: "salary" } });
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("type=salary"));
    expect(api.get).toHaveBeenLastCalledWith("/events", { params: { type: "salary", page: 1, page_size: 20 } });
  });
});
