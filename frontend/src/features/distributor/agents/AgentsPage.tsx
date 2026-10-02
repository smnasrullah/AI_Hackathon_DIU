import { ChevronDown, Download, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";

import { useRiskList } from "../../../api/hooks/agents";
import { exportRiskCsv } from "../../../api/services/agents";
import type { AgentRiskRow, RiskLevel, RiskSort } from "../../../api/types";
import { DataTable, type Column, type SortState } from "../../../components/ui/DataTable";
import { LiquidButton } from "../../../components/ui/LiquidButton";
import { Pagination } from "../../../components/ui/Pagination";
import { RiskPill } from "../../../components/ui/RiskPill";
import { SegmentedControl } from "../../../components/ui/SegmentedControl";
import { SourceChip } from "../../../components/ui/SourceChip";
import { toast } from "../../../components/ui/toastStore";
import { cn } from "../../../lib/cn";
import { formatDuration, formatPercent, localizeDigits } from "../../../lib/format";
import { useLocale } from "../../../lib/prefs";
import { useDebounced } from "../../../lib/useDebounced";
import { AgentTrend } from "./AgentTrend";
import {
  filterQuery,
  HORIZONS,
  LEVELS,
  pageQuery,
  PAGE_SIZE,
  patchState,
  readState,
  writeState,
  type Horizon,
  type OptionalColumn,
  type TableState,
} from "./agentsTableModel";
import { ColumnChooser } from "./ColumnChooser";

type LevelFilter = RiskLevel | "all";

/** Column -> server sort. Risk sorts high first; the others ascend. */
const SORT_BY_COLUMN: Record<string, RiskSort> = { agent: "name", level: "risk", probability: "risk", stockout: "stockout" };

function sortState(sort: RiskSort): SortState {
  if (sort === "risk") return { key: "level", dir: "desc" };
  if (sort === "stockout") return { key: "stockout", dir: "asc" };
  return { key: "agent", dir: "asc" };
}

/** Agents table (F3, §4): URL-synced filters, sort and page; column chooser, row expand, CSV export. */
export function AgentsPage() {
  const { t } = useTranslation();
  const { lang, digits } = useLocale();
  const [params, setParams] = useSearchParams();
  const state = useMemo(() => readState(params), [params]);
  const [search, setSearch] = useState(state.q);
  const settledSearch = useDebounced(search, 300);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const q = useRiskList(pageQuery(state));

  function update(patch: Partial<TableState>): void {
    setParams(writeState(patchState(state, patch)), { replace: true });
  }

  // The search box writes to the URL once typing settles (only when the settled text itself changes).
  const pushed = useRef(settledSearch);
  useEffect(() => {
    if (settledSearch === pushed.current) return;
    pushed.current = settledSearch;
    if (settledSearch.trim() !== state.q) setParams(writeState(patchState(state, { q: settledSearch })), { replace: true });
  }, [settledSearch, state, setParams]);

  async function exportCsv(): Promise<void> {
    setExporting(true);
    try {
      await exportRiskCsv(filterQuery(state));
      toast({ tone: "success", title: t("agentsTable.exported") });
    } catch {
      toast({ tone: "error", title: t("agentsTable.exportFailed") });
    } finally {
      setExporting(false);
    }
  }

  const all: Column<AgentRiskRow>[] = [
    {
      key: "agent",
      header: t("agentsTable.col.agent"),
      sortValue: (r) => r.name,
      cell: (r) => (
        <span className="flex items-center gap-2">
          <ChevronDown aria-hidden className={cn("size-4 shrink-0 text-muted transition-transform", expanded === r.agent_id && "rotate-180")} />
          <span className="min-w-0">
            <Link
              to={`/distributor/agents/${r.agent_id}`}
              onClick={(e) => e.stopPropagation()}
              className="block truncate font-semibold hover:underline"
            >
              {r.name}
            </Link>
            <span className="num block text-xs text-muted">{r.code}</span>
          </span>
        </span>
      ),
    },
    { key: "area", header: t("agentsTable.col.area"), cell: (r) => (r.upazila ? `${r.upazila}, ${r.district}` : r.district) },
    { key: "level", header: t("agentsTable.col.level"), sortValue: (r) => r.probability, cell: (r) => <RiskPill level={r.level} size="sm" /> },
    {
      key: "probability",
      header: t("agentsTable.col.probability"),
      align: "right",
      sortValue: (r) => r.probability,
      cell: (r) => <span className="num">{formatPercent(r.probability, digits)}</span>,
    },
    {
      key: "stockout",
      header: t("agentsTable.col.stockout"),
      sortValue: (r) => r.hours_to_stockout ?? Infinity,
      cell: (r) => (
        <span className="num">
          {r.hours_to_stockout === null ? t("agentsTable.none") : t("agentsTable.inHours", { duration: formatDuration(r.hours_to_stockout, lang, digits) })}
        </span>
      ),
    },
    { key: "float", header: t("agentsTable.col.float"), cell: (r) => t(`float.${r.worst_float}`) },
    { key: "tier", header: t("agentsTable.col.tier"), cell: (r) => <span className="num">{localizeDigits(String(r.tier), digits)}</span> },
  ];
  const columns = all.filter((c) => !state.hidden.includes(c.key as OptionalColumn));
  const data = q.data;

  return (
    <div className="space-y-4" data-testid="agents-page">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-h1 font-bold">{t("agentsTable.title")}</h1>
          <p className="mt-1 text-small text-muted">{t("agentsTable.lead")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ColumnChooser hidden={state.hidden} onChange={(hidden) => update({ hidden })} />
          <LiquidButton variant="secondary" icon={Download} loading={exporting} onClick={() => void exportCsv()} data-testid="export-csv">
            {t("agentsTable.export")}
          </LiquidButton>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-56 flex-1">
          <span className="sr-only">{t("agentsTable.search")}</span>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            maxLength={80}
            placeholder={t("agentsTable.search")}
            className="min-h-11 w-full rounded-[var(--radius-input)] border border-line-strong bg-surface pl-9 pr-3 text-body outline-none focus:border-pulse"
          />
        </label>
        <SegmentedControl<string>
          label={t("agentsTable.horizon")}
          size="sm"
          value={String(state.horizon)}
          onChange={(v) => update({ horizon: Number(v) as Horizon })}
          options={HORIZONS.map((h) => ({ value: String(h), label: localizeDigits(t("agentsTable.hours", { hours: h }), digits) }))}
        />
        <SegmentedControl<LevelFilter>
          label={t("agentsTable.level")}
          size="sm"
          value={state.level ?? "all"}
          onChange={(v) => update({ level: v === "all" ? null : v })}
          options={[{ value: "all", label: t("agentsTable.allLevels") }, ...LEVELS.map((l) => ({ value: l, label: t(`risk.${l}`) }))]}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <SourceChip source="model" />
        <SourceChip source="rule" />
        {data ? (
          <span className="num">{localizeDigits(t("agentsTable.asOf", { hours: data.horizon_h, model: data.model_version }), digits)}</span>
        ) : null}
      </div>

      <DataTable<AgentRiskRow>
        caption={t("agentsTable.caption")}
        columns={columns}
        rows={data?.items}
        getRowId={(r) => r.agent_id}
        loading={q.isPending}
        error={q.isError && !data}
        onRetry={() => void q.refetch()}
        sort={sortState(state.sort)}
        onSortChange={(s) => update({ sort: SORT_BY_COLUMN[s.key] ?? "risk" })}
        onRowClick={(r) => setExpanded((cur) => (cur === r.agent_id ? null : r.agent_id))}
        expandedId={expanded}
        renderExpanded={(r) => <AgentTrend row={r} />}
        maxHeight={640}
        empty={{
          title: t("agentsTable.empty.title"),
          body: t("agentsTable.empty.body"),
          action: { label: t("agentsTable.empty.action"), onClick: () => { setSearch(""); update({ level: null, q: "" }); } },
        }}
      />

      {data && data.total > 0 ? (
        <Pagination page={state.page} pageSize={PAGE_SIZE} total={data.total} onPageChange={(page) => update({ page })} />
      ) : null}
    </div>
  );
}
