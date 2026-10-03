import { Download } from "lucide-react";
import { useCallback, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

import { useAudit } from "../../../api/hooks/admin";
import type { AuditItem, AuditQuery } from "../../../api/types";
import { DataTable, type Column } from "../../../components/ui/DataTable";
import { LiquidButton } from "../../../components/ui/LiquidButton";
import { Pagination } from "../../../components/ui/Pagination";
import { TimeText } from "../../../components/ui/TimeText";
import { toast } from "../../../components/ui/toastStore";
import { downloadFile } from "../../../lib/download";
import { compact } from "../shared/apiError";
import { FIELD } from "../shared/fields";
import { SearchBox } from "../shared/SearchBox";
import { AdminHeader, FilterSelect } from "../shared/ui";
import { auditQuery, prettyPayload, type AuditUrlState } from "./auditModel";

const PAGE_SIZE = 50;
const ALL = "__all";

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="text-xs font-semibold text-muted">
        {label}
      </label>
      <input id={id} type="date" value={value} onChange={(e) => onChange(e.target.value)} className={`${FIELD} mt-0.5 min-h-10 text-small`} />
    </div>
  );
}

/** /admin/audit-log: every human decision and admin change; URL-synced filters, CSV export. */
export function AuditLogPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const state: AuditUrlState = {
    action: params.get("action") ?? "",
    entity: params.get("entity") ?? "",
    user: params.get("user") ?? "",
    from: params.get("from") ?? "",
    to: params.get("to") ?? "",
  };
  const page = Math.max(1, Number(params.get("page")) || 1);
  const filter: AuditQuery = auditQuery(state);
  const q = useAudit({ ...filter, page, page_size: PAGE_SIZE });
  const [expanded, setExpanded] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);

  const setQuery = useCallback(
    (next: Partial<AuditUrlState> & { page?: number }) => {
      setParams(
        (prev) => {
          const out = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(next)) {
            if (key === "page") continue;
            if (typeof value === "string" && value) out.set(key, value);
            else out.delete(key);
          }
          if (next.page && next.page > 1) out.set("page", String(next.page));
          else out.delete("page");
          return out;
        },
        { replace: true },
      );
    },
    [setParams],
  );
  const onUser = useCallback((v: string) => setQuery({ user: v }), [setQuery]);

  async function exportCsv() {
    setExporting(true);
    try {
      await downloadFile("/admin/audit-log/export.csv", compact(filter), "audit-log.csv");
      toast({ tone: "success", title: t("admin.common.exported") });
    } catch {
      toast({ tone: "error", title: t("admin.common.exportFailed") });
    } finally {
      setExporting(false);
    }
  }

  const facetOptions = (values: string[] | undefined) => [{ value: ALL, label: t("admin.common.all") }, ...(values ?? []).map((v) => ({ value: v, label: v }))];
  const columns: Column<AuditItem>[] = [
    { key: "when", header: t("admin.audit.col.when"), cell: (a) => <TimeText at={a.created_at} mode="datetime" className="text-xs" /> },
    {
      key: "user",
      header: t("admin.audit.col.user"),
      cell: (a) => (
        <span className="block min-w-0">
          <span className="block truncate">{a.user_email ?? t("admin.audit.system")}</span>
          {a.user_role ? <span className="text-xs text-muted">{t(`role.${a.user_role}`)}</span> : null}
        </span>
      ),
    },
    { key: "action", header: t("admin.audit.col.action"), cell: (a) => <span className="font-mono text-xs">{a.action}</span> },
    {
      key: "entity",
      header: t("admin.audit.col.entity"),
      cell: (a) => (
        <span className="font-mono text-xs">
          {a.entity_type} #{a.entity_id.length > 12 ? `${a.entity_id.slice(0, 8)}…` : a.entity_id}
        </span>
      ),
    },
    { key: "note", header: t("admin.audit.col.note"), cell: (a) => <span className="line-clamp-2 max-w-xs text-xs">{a.note ?? "—"}</span> },
  ];
  const filtered = Object.values(state).some(Boolean);

  return (
    <div className="space-y-4" data-testid="admin-audit">
      <AdminHeader
        title={t("admin.audit.title")}
        lead={t("admin.audit.lead")}
        actions={
          <LiquidButton variant="secondary" icon={Download} loading={exporting} onClick={() => void exportCsv()} data-testid="audit-export">
            {t("admin.common.exportCsv")}
          </LiquidButton>
        }
      />
      <div className="flex flex-wrap items-end gap-3">
        <FilterSelect<string>
          label={t("admin.audit.filterAction")}
          value={state.action || ALL}
          onChange={(v) => setQuery({ action: v === ALL ? "" : v })}
          options={facetOptions(q.data?.actions)}
        />
        <FilterSelect<string>
          label={t("admin.audit.filterEntity")}
          value={state.entity || ALL}
          onChange={(v) => setQuery({ entity: v === ALL ? "" : v })}
          options={facetOptions(q.data?.entity_types)}
        />
        <SearchBox label={t("admin.audit.filterUser")} value={state.user} onSettled={onUser} testId="audit-user" />
        <DateInput label={t("admin.audit.from")} value={state.from} onChange={(v) => setQuery({ from: v })} />
        <DateInput label={t("admin.audit.to")} value={state.to} onChange={(v) => setQuery({ to: v })} />
      </div>
      <DataTable
        caption={t("admin.audit.title")}
        columns={columns}
        rows={q.data?.items}
        getRowId={(a) => a.id}
        loading={q.isPending}
        error={q.isError && !q.data}
        onRetry={() => void q.refetch()}
        onRowClick={(a) => setExpanded((cur) => (cur === a.id ? null : a.id))}
        expandedId={expanded}
        renderExpanded={(a) => (
          <div className="text-xs">
            <p className="font-semibold">{t("admin.audit.payload")}</p>
            {a.note ? <p className="mt-1 whitespace-pre-wrap">{a.note}</p> : null}
            <pre className="mt-2 max-h-64 overflow-auto rounded-xl bg-surface p-3 font-mono" data-testid="audit-payload">
              {prettyPayload(a.payload)}
            </pre>
          </div>
        )}
        empty={{
          title: t("admin.audit.empty.title"),
          body: t("admin.audit.empty.body"),
          action: filtered
            ? { label: t("admin.common.clearFilters"), onClick: () => setParams(new URLSearchParams(), { replace: true }) }
            : { label: t("admin.common.refresh"), onClick: () => void q.refetch() },
        }}
        maxHeight={640}
      />
      {q.data && q.data.total > 0 ? <Pagination page={page} pageSize={PAGE_SIZE} total={q.data.total} onPageChange={(p) => setQuery({ page: p })} /> : null}
    </div>
  );
}
