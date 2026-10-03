import { CalendarPlus, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

import { useDeleteEvent, useEvents } from "../../../api/hooks/events";
import type { EventItem, EventType } from "../../../api/types";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { DataTable, type Column } from "../../../components/ui/DataTable";
import { LiquidButton } from "../../../components/ui/LiquidButton";
import { Pagination } from "../../../components/ui/Pagination";
import { TimeText } from "../../../components/ui/TimeText";
import { toast } from "../../../components/ui/toastStore";
import { formatNumber, localizeDigits } from "../../../lib/format";
import { useLocale } from "../../../lib/prefs";
import { AdminHeader, FilterSelect } from "../shared/ui";
import { EventFormDialog } from "./EventFormDialog";
import { EVENT_TYPES } from "./eventForm";

const PAGE_SIZE = 20;
type TypeFilter = EventType | "all";

function isType(v: string | null): v is EventType {
  return EVENT_TYPES.some((e) => e === v);
}

/** /admin/events: the event calendar the forecast uses; add, edit and delete (audited). */
export function AdminEventsPage() {
  const { t } = useTranslation();
  const { lang, digits } = useLocale();
  const [params, setParams] = useSearchParams();
  const rawType = params.get("type");
  const type: TypeFilter = isType(rawType) ? rawType : "all";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const q = useEvents({ ...(type === "all" ? {} : { type }), page, page_size: PAGE_SIZE });
  const remove = useDeleteEvent();
  const [editing, setEditing] = useState<EventItem | "new" | null>(null);
  const [deleting, setDeleting] = useState<EventItem | null>(null);

  function setQuery(next: { type?: TypeFilter; page?: number }) {
    const out = new URLSearchParams(params);
    const ty = next.type ?? type;
    if (ty === "all") out.delete("type");
    else out.set("type", ty);
    const p = next.page ?? (next.type ? 1 : page);
    if (p > 1) out.set("page", String(p));
    else out.delete("page");
    setParams(out, { replace: true });
  }

  function confirmDelete() {
    if (!deleting) return;
    remove.mutate(deleting.id, {
      onSuccess: () => toast({ tone: "success", title: t("admin.events.deleted") }),
      onError: () => toast({ tone: "error", title: t("admin.events.deleteFailed") }),
      onSettled: () => setDeleting(null),
    });
  }

  const name = (e: EventItem) => (lang === "bn" ? e.name_bn : e.name_en);
  const columns: Column<EventItem>[] = [
    { key: "type", header: t("admin.events.col.type"), cell: (e) => t(`admin.events.type.${e.type}`), sortValue: (e) => e.type },
    {
      key: "name",
      header: t("admin.events.col.name"),
      cell: (e) => (
        <span>
          <span className="block font-semibold">{name(e)}</span>
          <span className="block text-xs text-muted" lang={lang === "bn" ? "en" : "bn"}>
            {lang === "bn" ? e.name_en : e.name_bn}
          </span>
        </span>
      ),
      sortValue: name,
    },
    {
      key: "window",
      header: t("admin.events.col.window"),
      cell: (e) => (
        <span className="text-xs">
          <TimeText at={e.starts_at} mode="datetime" /> – <TimeText at={e.ends_at} mode="datetime" />
        </span>
      ),
      sortValue: (e) => e.starts_at,
    },
    { key: "district", header: t("admin.events.col.district"), cell: (e) => e.district ?? <span className="text-muted">{t("admin.events.nationwide")}</span> },
    {
      key: "intensity",
      header: t("admin.events.col.intensity"),
      align: "right",
      cell: (e) => <span className="num">{localizeDigits(t("admin.events.intensityValue", { value: formatNumber(e.intensity, digits, { fraction: 2 }) }), digits)}</span>,
      sortValue: (e) => e.intensity,
    },
    {
      key: "actions",
      header: t("admin.common.actions"),
      align: "right",
      cell: (e) => (
        <span className="inline-flex gap-1">
          <button
            type="button"
            onClick={() => setEditing(e)}
            aria-label={`${t("admin.common.edit")}: ${name(e)}`}
            className="ap-press grid size-10 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
          >
            <Pencil aria-hidden className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setDeleting(e)}
            aria-label={`${t("admin.common.delete")}: ${name(e)}`}
            className="ap-press grid size-10 place-items-center rounded-full text-muted hover:bg-act/12 hover:text-act-fg"
          >
            <Trash2 aria-hidden className="size-4" />
          </button>
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4" data-testid="admin-events">
      <AdminHeader
        title={t("admin.events.title")}
        lead={t("admin.events.lead")}
        actions={
          <LiquidButton icon={CalendarPlus} onClick={() => setEditing("new")} data-testid="add-event">
            {t("admin.events.add")}
          </LiquidButton>
        }
      />
      <div className="flex flex-wrap items-end gap-3">
        <FilterSelect<TypeFilter>
          label={t("admin.events.filterType")}
          value={type}
          onChange={(v) => setQuery({ type: v })}
          options={[{ value: "all", label: t("admin.common.all") }, ...EVENT_TYPES.map((e) => ({ value: e, label: t(`admin.events.type.${e}`) }))]}
        />
      </div>
      <DataTable
        caption={t("admin.events.title")}
        columns={columns}
        rows={q.data?.items}
        getRowId={(e) => e.id}
        loading={q.isPending}
        error={q.isError && !q.data}
        onRetry={() => void q.refetch()}
        empty={{
          title: t("admin.events.empty.title"),
          body: t("admin.events.empty.body"),
          action: type === "all" ? { label: t("admin.events.add"), onClick: () => setEditing("new") } : { label: t("admin.common.clearFilters"), onClick: () => setQuery({ type: "all" }) },
        }}
        maxHeight={640}
      />
      {q.data && q.data.total > 0 ? <Pagination page={page} pageSize={PAGE_SIZE} total={q.data.total} onPageChange={(p) => setQuery({ page: p })} /> : null}
      <EventFormDialog target={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => (open ? undefined : setDeleting(null))}
        title={t("admin.events.deleteTitle")}
        description={t("admin.events.deleteBody", { name: deleting ? name(deleting) : "" })}
        confirmLabel={t("admin.common.delete")}
        tone="danger"
        pending={remove.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
