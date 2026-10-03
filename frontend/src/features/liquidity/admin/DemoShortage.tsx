import { Zap } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

import { useAgentProfiles, useSimulateShortage } from "../../../api/hooks/helpRequests";
import type { FloatType, SimulateOut } from "../../../api/types";
import { LiquidButton } from "../../../components/ui/LiquidButton";
import { ErrorState } from "../../../components/ui/StatePanel";
import { SkeletonRows } from "../../../components/ui/Skeleton";
import { formatNumber } from "../../../lib/format";
import { useLocale } from "../../../lib/prefs";

const FIELD = "min-h-11 w-full rounded-[var(--radius-input)] border border-line bg-surface px-3 text-body outline-none focus-visible:border-pulse";

/** DEMO_MODE only (the page hides it otherwise). Forces one shop short and runs the helper search now. */
export function DemoShortage() {
  const { t } = useTranslation();
  const { digits } = useLocale();
  const agentId = useId();
  const floatId = useId();
  const agents = useAgentProfiles(true);
  const simulate = useSimulateShortage();
  const [agent, setAgent] = useState<number | null>(null);
  const [floatType, setFloatType] = useState<FloatType>("cash");
  const [result, setResult] = useState<SimulateOut | null>(null);
  const [failed, setFailed] = useState(false);

  function run(): void {
    if (agent === null) return;
    setFailed(false);
    simulate.mutate(
      { agent_id: agent, float_type: floatType },
      {
        onSuccess: (data) => setResult(data),
        onError: () => {
          setResult(null);
          setFailed(true);
        },
      },
    );
  }

  return (
    <section aria-labelledby="demo-title" className="ap-card space-y-4 border-dashed p-5">
      <div>
        <h2 id="demo-title" className="font-display text-h2 font-bold">
          {t("liquidity.admin.demo.title")}
        </h2>
        <p className="text-small text-muted">{t("liquidity.admin.demo.lead")}</p>
      </div>

      {agents.isPending ? (
        <SkeletonRows rows={2} cols={1} />
      ) : agents.isError ? (
        <ErrorState onRetry={() => void agents.refetch()} retrying={agents.isFetching} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
          <label htmlFor={agentId} className="block space-y-1.5">
            <span className="text-small font-semibold">{t("liquidity.admin.demo.agent")}</span>
            <select id={agentId} data-testid="demo-agent" value={agent ?? ""} onChange={(e) => setAgent(e.target.value === "" ? null : Number(e.target.value))} className={FIELD}>
              <option value="">—</option>
              {agents.data.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {a.name}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor={floatId} className="block space-y-1.5">
            <span className="text-small font-semibold">{t("liquidity.admin.demo.float")}</span>
            <select id={floatId} data-testid="demo-float" value={floatType} onChange={(e) => setFloatType(e.target.value as FloatType)} className={FIELD}>
              <option value="cash">{t("float.cash")}</option>
              <option value="emoney">{t("float.emoney")}</option>
            </select>
          </label>
          <LiquidButton data-testid="demo-simulate" icon={Zap} loading={simulate.isPending} disabled={agent === null || simulate.isPending} onClick={run}>
            {t("liquidity.admin.demo.run")}
          </LiquidButton>
        </div>
      )}

      {result ? (
        <p role="status" data-testid="demo-result" className="text-small font-semibold">
          {!result.sent
            ? t(result.dry_run ? "liquidity.admin.demo.dryRun" : "liquidity.admin.demo.switchedOff", {
                n: formatNumber(result.would_create.reduce((sum, p) => sum + p.asks.length, 0), digits),
              })
            : result.created_request_ids.length === 0
              ? t("liquidity.admin.demo.none")
              : t("liquidity.admin.demo.done", { agent: result.agent_code, n: formatNumber(result.created_request_ids.length, digits) })}
        </p>
      ) : null}
      {failed ? (
        <p role="alert" className="text-small font-semibold text-act-fg">
          {t("liquidity.admin.demo.failed")}
        </p>
      ) : null}
    </section>
  );
}
