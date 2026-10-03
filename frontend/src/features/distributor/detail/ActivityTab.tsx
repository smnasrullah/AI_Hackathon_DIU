import { ArrowLeftRight, Inbox, RotateCw, ScanSearch, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useAnomalies } from "../../../api/hooks/anomalies";
import { useRequests } from "../../../api/hooks/requests";
import { useSwaps } from "../../../api/hooks/swaps";
import { SkeletonRows } from "../../../components/ui/Skeleton";
import { StaggerItem, StaggerList } from "../../../components/ui/Stagger";
import { EmptyState, ErrorState } from "../../../components/ui/StatePanel";
import { TimeText } from "../../../components/ui/TimeText";
import { formatMoney } from "../../../lib/format";
import { useLocale } from "../../../lib/prefs";
import { agentActivity, type ActivityEntry, type ActivityKind } from "./activityModel";

const ICON: Record<ActivityKind, LucideIcon> = { request: Inbox, swap: ArrowLeftRight, anomaly: ScanSearch };

function Entry({ entry }: { entry: ActivityEntry }) {
  const { t } = useTranslation();
  const { lang, digits } = useLocale();
  const Icon = ICON[entry.kind];
  const text = t(`detail.activity.${entry.event}`, {
    amount: entry.amount === null ? "" : formatMoney(entry.amount, digits, { lang }),
    float: entry.float ? t(`float.${entry.float}`) : "",
    partner: entry.partner ?? "",
  });
  return (
    <StaggerItem className="relative flex gap-3 pb-4 pl-1" data-testid="activity-entry" data-kind={entry.kind} data-event={entry.event}>
      <span className="relative z-10 grid size-9 shrink-0 place-items-center rounded-full border border-line bg-surface">
        <Icon aria-hidden className="size-4 text-muted" />
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <Link to={entry.link} className="font-semibold hover:underline">
          {text}
        </Link>
        <p className="text-xs text-muted">
          <TimeText at={entry.at} mode="datetime" />
          {entry.by ? ` · ${entry.by}` : ""}
        </p>
        {entry.note ? <p className="mt-1 border-l-2 border-line-strong pl-2 text-small text-muted">{entry.note}</p> : null}
      </div>
    </StaggerItem>
  );
}

/** Requests, swaps and anomaly reviews for this agent on one timeline (every human decision has its note). */
export function ActivityTab({ agentId }: { agentId: number }) {
  const { t } = useTranslation();
  const requests = useRequests({ page_size: 100 });
  const swaps = useSwaps({ page_size: 100 });
  const anomalies = useAnomalies({ page_size: 100 });
  const all = [requests, swaps, anomalies];

  if (all.some((q) => q.isPending)) return <SkeletonRows rows={4} cols={2} />;
  if (all.some((q) => q.isError)) {
    return <ErrorState compact onRetry={() => all.forEach((q) => void q.refetch())} retrying={all.some((q) => q.isFetching)} />;
  }
  const entries = agentActivity(agentId, requests.data?.items ?? [], swaps.data?.items ?? [], anomalies.data?.items ?? []);
  if (entries.length === 0) {
    return (
      <EmptyState
        compact
        illustration="quiet-pulse"
        title={t("detail.activity.emptyTitle")}
        body={t("detail.activity.emptyBody")}
        action={{ label: t("detail.refresh"), icon: RotateCw, onClick: () => all.forEach((q) => void q.refetch()) }}
      />
    );
  }
  return (
    <StaggerList className="relative before:absolute before:bottom-4 before:left-[1.35rem] before:top-2 before:w-px before:bg-line" aria-label={t("detail.tabs.activity")}>
      {entries.map((e) => (
        <Entry key={e.id} entry={e} />
      ))}
    </StaggerList>
  );
}
