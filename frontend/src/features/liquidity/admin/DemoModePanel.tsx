import { FlaskConical, RotateCcw } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useDemoHelp, useResetDemoHelp } from "../../../api/hooks/helpRequests";
import type { DemoHelpInfo } from "../../../api/types";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { LiquidButton } from "../../../components/ui/LiquidButton";
import { ErrorState } from "../../../components/ui/StatePanel";
import { SkeletonRows } from "../../../components/ui/Skeleton";
import { TimeText } from "../../../components/ui/TimeText";
import { toast } from "../../../components/ui/toastStore";
import { formatNumber } from "../../../lib/format";
import { useLocale } from "../../../lib/prefs";

/** Setting name (API) -> the field label the settings forms use. */
const FIELD_LABEL = {
  max_recipients_per_wave: "liquidity.admin.fields.perWave.label",
  max_request_bdt: "liquidity.admin.fields.maxRequest.label",
  wave_timeout_min: "liquidity.admin.fields.waveTimeout.label",
  max_waves: "liquidity.admin.fields.maxWaves.label",
  recent_ask_h: "liquidity.admin.fields.recentAsk.label",
} as const;

function Overrides({ info }: { info: DemoHelpInfo }) {
  const { t } = useTranslation();
  const { digits } = useLocale();
  return (
    <dl className="grid gap-x-6 gap-y-2 text-small sm:grid-cols-2" data-testid="demo-overrides">
      {info.overrides.map((o) => (
        <div key={o.name} className="flex justify-between gap-3 border-b border-line/60 py-1">
          <dt className="text-muted">{o.name in FIELD_LABEL ? t(FIELD_LABEL[o.name as keyof typeof FIELD_LABEL]) : o.name}</dt>
          <dd className="num font-semibold">{formatNumber(o.value, digits)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** DEMO_MODE only (the page hides it otherwise): the demo defaults in force (read-only) and the
 * "reset demo help-request state" action behind a confirm dialog. */
export function DemoModePanel() {
  const { t } = useTranslation();
  const { digits } = useLocale();
  const info = useDemoHelp(true);
  const reset = useResetDemoHelp();
  const [confirming, setConfirming] = useState(false);

  function runReset(): void {
    reset.mutate(undefined, {
      onSuccess: (data) => toast({ tone: "success", title: t("liquidity.admin.demoMode.resetDone", { n: formatNumber(data.cancelled_request_ids.length, digits) }) }),
      onError: () => toast({ tone: "error", title: t("liquidity.admin.demoMode.resetFailed") }),
      onSettled: () => setConfirming(false),
    });
  }

  return (
    <section aria-labelledby="demo-mode-title" className="ap-card space-y-4 border-dashed p-5" data-testid="demo-mode-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          <FlaskConical aria-hidden className="mt-1 size-5 shrink-0 text-pulse-fg" />
          <div>
            <h2 id="demo-mode-title" className="font-display text-h2 font-bold">
              {t("liquidity.admin.demoMode.title")}
            </h2>
            <p className="text-small text-muted">{t("liquidity.admin.demoMode.lead")}</p>
          </div>
        </div>
        <LiquidButton variant="secondary" icon={RotateCcw} data-testid="demo-reset" onClick={() => setConfirming(true)}>
          {t("liquidity.admin.demoMode.reset")}
        </LiquidButton>
      </div>

      {info.isPending ? (
        <SkeletonRows rows={3} cols={2} />
      ) : info.isError ? (
        <ErrorState onRetry={() => void info.refetch()} retrying={info.isFetching} />
      ) : (
        <div className="space-y-3">
          {info.data.overrides.length > 0 ? <Overrides info={info.data} /> : <p className="text-small text-muted">{t("liquidity.admin.demoMode.none")}</p>}
          <ul className="space-y-1 text-small text-muted">
            {info.data.auto_per_day > 0 ? <li>{t("liquidity.admin.demoMode.autoCap", { n: formatNumber(info.data.auto_per_day, digits) })}</li> : null}
            {info.data.start_delay_s > 0 ? <li>{t("liquidity.admin.demoMode.startDelay", { n: formatNumber(info.data.start_delay_s, digits) })}</li> : null}
            {info.data.last_reset_at ? (
              <li>
                {t("liquidity.admin.demoMode.lastReset")} <TimeText at={info.data.last_reset_at} mode="datetime" />
              </li>
            ) : null}
          </ul>
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={(open) => (open ? undefined : setConfirming(false))}
        title={t("liquidity.admin.demoMode.resetTitle")}
        description={t("liquidity.admin.demoMode.resetBody")}
        confirmLabel={t("liquidity.admin.demoMode.reset")}
        tone="danger"
        pending={reset.isPending}
        onConfirm={runReset}
      />
    </section>
  );
}
