import { describe, expect, it } from "vitest";

import type { NotificationItem } from "../../api/types";
import { notificationLink } from "./notificationModel";

function help(params: NotificationItem["params"], id = "42"): NotificationItem {
  return {
    id: 1,
    type: "help_request",
    severity: "info",
    title_key: "notifications.help.new",
    params,
    entity_type: "liquidity_request",
    entity_id: id,
    read_at: null,
    created_at: "2026-10-03T09:00:00Z",
  };
}

describe("notificationLink for help requests", () => {
  it("uses the reader's own deep link from the server", () => {
    expect(notificationLink(help({ link: "/agent/help" }), "agent")).toBe("/agent/help");
    expect(notificationLink(help({ link: "/distributor/help-requests/42" }), "distributor")).toBe("/distributor/help-requests/42");
  });

  it("never follows a link meant for another role or another site", () => {
    expect(notificationLink(help({ link: "/admin/help-settings" }), "agent")).toBe("/agent/help");
    expect(notificationLink(help({ link: "https://evil.example/x" }), "distributor")).toBe("/distributor/help-requests/42");
  });

  it("falls back to the role's page when the link is missing", () => {
    expect(notificationLink(help({}), "agent")).toBe("/agent/help");
    expect(notificationLink(help({}), "distributor")).toBe("/distributor/help-requests/42");
    expect(notificationLink(help({}), "admin")).toBe("/admin/help-settings");
  });
});
