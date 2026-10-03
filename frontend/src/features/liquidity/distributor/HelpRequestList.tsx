import { AlertTriangle, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useMyHelpRequests } from "../../../api/hooks/helpRequests";
import type { HelpRequestItem, HelpStatus, Lang } from "../../../api/types";
import { EmptyState, ErrorState } from "../../../components/ui/StatePanel";
import { SkeletonRows } from "../../../components/ui/Skeleton";
import { formatDateTime, formatMoney } from "../../../lib/format";
import { useLocale } from "../../../lib/prefs";
import { attentionFor } from "../helpModel";

type Filter = HelpStatus | "all";
const FILTERS: Filter[] = ["all", "open", "claimed", "fulfilled", "expired", "cancelled"];
const FIELD = "min-h-11 w-full rounded-[var(--radius-input)] border border-line bg-surface px-3 text-small outline-none focus-visible:border-pulse sm:w-64";

/** The requests from my agents, filterable by status. Attention flags sit on the row, not only in colour. */
export function HelpRequestList() {
  const { t } = useTranslation();
  const { lang, digits } = useLocale();
  const [status, setStatus] = useState<Filter>("all");
  const q = useMyHelpRequests(status === "all" ? { page_size: 50 } : { status, page_size: 50 });

  return (
    <div className="space-y-4">
      <label className="block space-y-1">
        <span className="text-small font-semibold">{t("liquidity.dist.filter")}</span>
        <select data-testid="help-status-filter" value={status} onChange={(e) => setStatus(e.target.value as Filter)} className={FIELD}>
          {FILTERS.map((f) => (
            <option key={f} value={f}>
              {f === "all" ? t("liquidity.dist.all") : t(`liquidity.status.${f}`)}
            </option>
          ))}
        </select>
      </label>

      {q.isPending ? (
        <SkeletonRows rows={4} cols={1} />
      ) : q.isError ? (
        <ErrorState onRetry={() => void q.refetch()} retrying={q.isFetching} />
      ) : q.data.items.length === 0 ? (
        <EmptyState title={t("liquidity.dist.empty.title")} body={t("liquidity.dist.empty.body")} action={{ label: t("common.retry"), onClick: () => void q.refetch() }} />
      ) : (
        <ul className="space-y-3" data-testid="help-request-list">
          {q.data.items.map((item) => (
            <li key={item.id}>
              <HelpRequestRow item={item} lang={lang} digits={digits} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HelpRequestRow({ item, lang, digits }: { item: HelpRequestItem; lang: Lang; digits: Lang }) {
  const { t } = useTranslation();
  const attention = attentionFor(item);
  const amount = formatMoney(item.amount_needed, digits, { lang });
  const area = item.requester.upazila ?? item.requester.district;
  return (
    <Link
      to={`/distributor/help-requests/${item.id}`}
      data-testid={`help-row-${item.id}`}
      data-status={item.status}
      className="ap-card ap-press flex items-center gap-3 p-4 shadow-soft hover:bg-surface-2"
    >
      <span className="min-w-0 flex-1 space-y-1">
        <span className="block font-semibold">
          {item.requester.name} · {area}
        </span>
        <span className="block text-small">{t("liquidity.agent.card.needs", { amount, float: t(`float.${item.float_type}`) })}</span>
        <span className="block text-small text-muted">
          {t("liquidity.dist.deadline", { time: item.deadline_asap ? t("liquidity.asap") : formatDateTime(new Date(item.needed_by), lang, digits) })}
        </span>
        <span className="block text-small text-muted">
          {item.claimed_by ? t("liquidity.dist.claimedBy", { code: item.claimed_by.display }) : t("liquidity.dist.nobody")}
        </span>
        <span className="block text-small font-semibold">{t(`liquidity.status.${item.status}`)}</span>
        {attention ? (
          <span data-testid="help-attention" className="inline-flex items-center gap-1.5 rounded-full bg-act-solid px-2.5 py-0.5 text-xs font-bold text-white">
            <AlertTriangle aria-hidden className="size-3.5" />
            {t(`liquidity.attention.${attention}`)}
          </span>
        ) : null}
      </span>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
    </Link>
  );
}
