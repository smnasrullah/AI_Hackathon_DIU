import { AlertTriangle, Play, Timer } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useAdminOverview } from "../../../api/hooks/admin";
import { useRunHelpTrigger } from "../../../api/hooks/helpRequests";
import type { AdminOverview } from "../../../api/types";
import { LiquidButton } from "../../../components/ui/LiquidButton";
import { ErrorState } from "../../../components/ui/StatePanel";
import { SkeletonRows } from "../../../components/ui/Skeleton";
import { TimeText } from "../../../components/ui/TimeText";
import { formatNumber } from "../../../lib/format";
import { useLocale } from "../../../lib/prefs";
import { WouldAskList } from "./WouldAskList";
import { HELP_ADMIN_NS } from "../../../i18n/helpAdmin";

type Status = NonNullable<AdminOverview["help_scheduler"]>;
const COUNTS = ["requests_created", "waves_advanced", "waves_exhausted", "reopened", "expired"] as const;

function Fields({ s }: { s: Status }) {
  const { t: th } = useTranslation(HELP_ADMIN_NS);
  const { digits } = useLocale();
  const result = s.last_result;
  return (
    <dl className="grid gap-x-6 gap-y-2 text-small sm:grid-cols-2" data-testid="scheduler-status">
      <div>
        <dt className="text-muted">{th("scheduler.lastRun")}</dt>
        <dd className="font-semibold">{s.last_run_at ? <TimeText at={s.last_run_at} mode="datetime" /> : th("scheduler.never")}</dd>
      </div>
      <div>
        <dt className="text-muted">{th("scheduler.nextRun")}</dt>
        <dd className="font-semibold">{s.next_run_at ? <TimeText at={s.next_run_at} mode="datetime" /> : "—"}</dd>
      </div>
      <div className="sm:col-span-2">
        <dt className="text-muted">{th("scheduler.lastResult")}</dt>
        <dd className="num font-semibold">
          {result
            ? COUNTS.map((k) => th(`scheduler.counts.${k}`, { n: formatNumber(result[k] ?? 0, digits) })).join(" · ")
            : "—"}
        </dd>
      </div>
      <div className="sm:col-span-2">
        <dt className="text-muted">{th("scheduler.lastError")}</dt>
        <dd data-testid="scheduler-error" className={s.last_error ? "font-semibold text-act-fg" : "font-semibold"}>
          {s.last_error ?? th("scheduler.noError")}
        </dd>
      </div>
    </dl>
  );
}

/** The background help scheduler as its leader last recorded it, plus "run one check now". */
export function SchedulerStatusCard() {
  const { t: th } = useTranslation(HELP_ADMIN_NS);
  const { digits } = useLocale();
  const overview = useAdminOverview();
  const run = useRunHelpTrigger();
  const status = overview.data?.help_scheduler ?? null;

  return (
    <section aria-labelledby="scheduler-title" className="ap-card space-y-4 p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          <Timer aria-hidden className="mt-1 size-5 shrink-0 text-muted" />
          <div>
            <h2 id="scheduler-title" className="font-display text-h2 font-bold">
              {th("scheduler.title")}
            </h2>
            <p className="text-small text-muted">{th("scheduler.lead")}</p>
          </div>
        </div>
        <LiquidButton variant="secondary" icon={Play} data-testid="run-trigger" loading={run.isPending} disabled={run.isPending} onClick={() => run.mutate()}>
          {th("scheduler.runNow")}
        </LiquidButton>
      </div>

      {overview.isPending ? (
        <SkeletonRows rows={2} cols={2} />
      ) : overview.isError ? (
        <ErrorState onRetry={() => void overview.refetch()} retrying={overview.isFetching} />
      ) : status === null ? (
        <p className="text-small text-muted">{th("scheduler.notYet")}</p>
      ) : (
        <>
          {status.stale ? (
            <p role="alert" className="flex items-center gap-2 text-small font-semibold text-act-fg">
              <AlertTriangle aria-hidden className="size-4" />
              {th("scheduler.stale")}
            </p>
          ) : null}
          <Fields s={status} />
        </>
      )}

      {run.isError ? (
        <p role="alert" className="text-small font-semibold text-act-fg">
          {th("scheduler.runFailed")}
        </p>
      ) : null}
      {run.data ? (
        run.data.sent ? (
          <p role="status" data-testid="run-result" className="text-small font-semibold">
            {th("scheduler.ran", { n: formatNumber(run.data.created_request_ids.length, digits) })}
          </p>
        ) : (
          <WouldAskList dryRun={run.data.dry_run} items={run.data.would_create} />
        )
      ) : null}
    </section>
  );
}
