import type { RiskLevel, RiskListQuery, RiskSort } from "../../../api/types";

export const HORIZONS = [6, 24, 72] as const;
export type Horizon = (typeof HORIZONS)[number];
export const LEVELS: RiskLevel[] = ["red", "amber", "green"];
export const SORTS: RiskSort[] = ["risk", "stockout", "name", "code"];
export const PAGE_SIZE = 20;

/** Agent and risk always show; the rest can be hidden with the column chooser. */
export const OPTIONAL_COLUMNS = ["area", "probability", "stockout", "float", "tier"] as const;
export type OptionalColumn = (typeof OPTIONAL_COLUMNS)[number];

export interface TableState {
  horizon: Horizon;
  level: RiskLevel | null;
  sort: RiskSort;
  q: string;
  page: number;
  hidden: OptionalColumn[];
}

export const DEFAULT_STATE: TableState = { horizon: 24, level: null, sort: "risk", q: "", page: 1, hidden: [] };

function oneOf<T>(list: readonly T[], raw: unknown): T | null {
  return list.find((v) => String(v) === raw) ?? null;
}

/** URL -> table state; anything unknown falls back to the default. */
export function readState(params: URLSearchParams): TableState {
  const page = Number(params.get("page"));
  return {
    horizon: oneOf(HORIZONS, params.get("horizon")) ?? DEFAULT_STATE.horizon,
    level: oneOf(LEVELS, params.get("level")),
    sort: oneOf(SORTS, params.get("sort")) ?? DEFAULT_STATE.sort,
    q: (params.get("q") ?? "").slice(0, 80),
    page: Number.isInteger(page) && page > 1 ? page : 1,
    hidden: (params.get("hide") ?? "")
      .split(",")
      .map((c) => oneOf(OPTIONAL_COLUMNS, c))
      .filter((c): c is OptionalColumn => c !== null),
  };
}

/** Table state -> URL, defaults left out so a plain link stays short. */
export function writeState(state: TableState): URLSearchParams {
  const out = new URLSearchParams();
  if (state.horizon !== DEFAULT_STATE.horizon) out.set("horizon", String(state.horizon));
  if (state.level) out.set("level", state.level);
  if (state.sort !== DEFAULT_STATE.sort) out.set("sort", state.sort);
  if (state.q.trim()) out.set("q", state.q.trim());
  if (state.page > 1) out.set("page", String(state.page));
  if (state.hidden.length) out.set("hide", OPTIONAL_COLUMNS.filter((c) => state.hidden.includes(c)).join(","));
  return out;
}

/** Filters for both the page and the CSV export. */
export function filterQuery(state: TableState): Omit<RiskListQuery, "page" | "page_size"> {
  return { horizon: state.horizon, sort: state.sort, ...(state.level ? { level: state.level } : {}), ...(state.q.trim() ? { q: state.q.trim() } : {}) };
}

export function pageQuery(state: TableState): RiskListQuery {
  return { ...filterQuery(state), page: state.page, page_size: PAGE_SIZE };
}

/** Changing a filter or the sort goes back to page 1. */
export function patchState(state: TableState, patch: Partial<TableState>): TableState {
  const resetsPage = ["horizon", "level", "sort", "q"].some((k) => k in patch);
  return { ...state, ...patch, page: patch.page ?? (resetsPage ? 1 : state.page) };
}
