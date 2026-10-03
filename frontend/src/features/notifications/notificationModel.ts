// Text, deep links and day groups for in-app notifications. The server sends i18n keys + params.
import type { NotificationItem } from "../../api/types";
import { translateKey } from "../../i18n/dynamic";
import { dhakaParts, formatMoney, formatNumber, localizeDigits, type Digits } from "../../lib/format";
import type { Lang, Role } from "../auth/types";

type Params = NotificationItem["params"];

const MONEY = new Set(["amount_bdt"]);
const DECIMAL = new Set(["distance_km"]);
const ENUMS: Record<string, string> = { from: "risk", to: "risk", float_type: "float", status: "swapStatus" };

function formatParams(params: Params, lang: Lang, digits: Digits): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "number") {
      out[name] = MONEY.has(name)
        ? formatMoney(value, digits, { compact: value >= 100_000, lang })
        : formatNumber(value, digits, { fraction: DECIMAL.has(name) ? 1 : 0 });
    } else if (typeof value === "string" && ENUMS[name]) {
      out[name] = translateKey(`${ENUMS[name]}.${value}`, undefined, value);
    } else {
      out[name] = localizeDigits(String(value), digits);
    }
  }
  return out;
}

export function notificationText(item: NotificationItem, lang: Lang, digits: Digits): string {
  return translateKey(item.title_key, formatParams(item.params, lang, digits), translateKey("notifications.fallback"));
}

/** Where a notification leads, for this role; null when there is nothing to open. */
export function notificationLink(item: NotificationItem, role: Role): string | null {
  const id = item.entity_id;
  switch (item.entity_type) {
    case "agent":
      if (role === "agent") return "/agent";
      return role === "distributor" && id ? `/distributor/agents/${id}` : null;
    case "distributor":
      return role === "distributor" ? "/distributor" : null;
    case "swap":
      if (role === "agent") return "/agent/swap";
      return role === "distributor" ? "/distributor/swaps" : null;
    case "liquidity_request": {
      // The server sends each reader's own link; the role mapping below is the fallback.
      const link = item.params.link;
      if (typeof link === "string" && link.startsWith("/") && link.startsWith(`/${role}`)) return link;
      if (role === "agent") return "/agent/help";
      if (role === "admin") return "/admin/help-settings";
      return role === "distributor" && id ? `/distributor/help-requests/${id}` : null;
    }
    case "anomaly":
      if (role !== "distributor") return null;
      return id ? `/distributor/anomalies/${id}` : "/distributor/anomalies";
    default:
      return null;
  }
}

export interface DayGroup {
  /** "today" | "yesterday" | ISO date (YYYY-MM-DD, Asia/Dhaka). */
  day: string;
  items: NotificationItem[];
}

function dayKey(at: Date): string {
  const { year, month, day } = dhakaParts(at);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Newest first, grouped by Dhaka calendar day. */
export function groupByDay(items: NotificationItem[], now: Date): DayGroup[] {
  const today = dayKey(now);
  const yesterday = dayKey(new Date(now.getTime() - 86_400_000));
  const groups: DayGroup[] = [];
  for (const item of items) {
    const key = dayKey(new Date(item.created_at));
    const day = key === today ? "today" : key === yesterday ? "yesterday" : key;
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(item);
    else groups.push({ day, items: [item] });
  }
  return groups;
}
