import { ArrowLeft, ArrowLeftRight, ArrowRight, ExternalLink, FilterX, Siren, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import type { MapAgent, MapSwap } from "../../../api/types";
import { RiskPill } from "../../../components/ui/RiskPill";
import { EmptyState } from "../../../components/ui/StatePanel";
import { cn } from "../../../lib/cn";
import { formatMoney, formatPercent, localizeDigits } from "../../../lib/format";
import { useLocale } from "../../../lib/prefs";
import { RunwaySection } from "../../agent/home/RunwaySection";
import { WhyPanel } from "../../agent/home/WhyPanel";
import { swapsOf } from "./controlRoomModel";
import { useControlRoomStore } from "./controlRoomStore";

const LINK =
  "inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface px-4 text-small font-semibold hover:bg-surface-2";

interface InspectorProps {
  agent: MapAgent | null;
  /** Every scoped agent (for swap partner names). */
  all: MapAgent[];
  swaps: MapSwap[];
  hour: number;
  /** First agent of the current list, offered when nothing is selected. */
  riskiest: MapAgent | null;
  /** Mobile: back to the list. */
  onBack?: () => void;
  className?: string;
}

function SwapRow({ swap, agentId, names }: { swap: MapSwap; agentId: number; names: Map<number, string> }) {
  const { t } = useTranslation();
  const { lang, digits } = useLocale();
  const giving = swap.donor_agent_id === agentId;
  const partner = names.get(giving ? swap.receiver_agent_id : swap.donor_agent_id) ?? "—";
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-3 py-2 text-small" data-testid="inspector-swap">
      {giving ? <ArrowRight aria-hidden className="size-4 text-emoney" /> : <ArrowLeft aria-hidden className="size-4 text-cash" />}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{t(giving ? "controlRoom.inspector.gives" : "controlRoom.inspector.gets", { name: partner })}</span>
        <span className="text-xs text-muted">
          {t(`float.${swap.float_type}`)} · {t(`controlRoom.swapStatus.${swap.status}`)}
        </span>
      </span>
      <span className="num font-semibold">{formatMoney(swap.amount_bdt, digits, { lang })}</span>
    </li>
  );
}

/** Right pane: the selected agent's risk at the scrubbed hour, 72h runway, reasons and swaps. */
export function Inspector({ agent, all, swaps, hour, riskiest, onBack, className }: InspectorProps) {
  const { t } = useTranslation();
  const { digits } = useLocale();
  const select = useControlRoomStore((s) => s.select);
  const resetFilters = useControlRoomStore((s) => s.resetFilters);

  if (!agent) {
    return (
      <EmptyState
        compact
        illustration="quiet-pulse"
        className={className}
        title={t("controlRoom.inspector.emptyTitle")}
        body={t("controlRoom.inspector.emptyBody")}
        action={
          riskiest
            ? { label: t("controlRoom.inspector.riskiest"), icon: Siren, onClick: () => select(riskiest.agent_id) }
            : { label: t("controlRoom.filters.reset"), icon: FilterX, onClick: resetFilters }
        }
      />
    );
  }

  const names = new Map(all.map((a) => [a.agent_id, a.name]));
  const mine = swapsOf(swaps, agent.agent_id);
  const odds = localizeDigits(
    t("controlRoom.inspector.odds", { probability: formatPercent(agent.probability, digits), hours: hour, float: t(`float.${agent.worst_float}`) }),
    digits,
  );

  return (
    <article aria-labelledby="inspector-title" className={cn("space-y-4", className)} data-testid="inspector">
      <header className="space-y-2">
        <div className="flex items-start gap-2">
          {onBack ? (
            <button type="button" onClick={onBack} aria-label={t("controlRoom.inspector.back")} className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-surface-2">
              <ArrowLeft aria-hidden className="size-5" />
            </button>
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 id="inspector-title" className="truncate font-display text-h2 font-bold">
              {agent.name}
            </h2>
            <p className="num text-xs text-muted">
              {agent.code} · {agent.upazila ? `${agent.upazila}, ` : ""}
              {agent.district}
            </p>
          </div>
          {onBack ? null : (
            <button type="button" onClick={() => select(null)} aria-label={t("common.close")} className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-surface-2">
              <X aria-hidden className="size-5" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RiskPill level={agent.level} />
          <span className="text-small text-muted">{odds}</span>
        </div>
      </header>

      <RunwaySection key={`${agent.agent_id}-${agent.worst_float}`} agentId={agent.agent_id} floatType={agent.worst_float} events={[]} />

      <WhyPanel key={agent.agent_id} agentId={agent.agent_id} initialFloat={agent.worst_float} forecastPath={`/distributor/agents/${agent.agent_id}`} />

      <section aria-labelledby="inspector-swaps" className="space-y-2">
        <h3 id="inspector-swaps" className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
          {t("controlRoom.inspector.swaps")}
        </h3>
        {mine.length ? (
          <ul className="space-y-2">
            {mine.map((s) => (
              <SwapRow key={s.id} swap={s} agentId={agent.agent_id} names={names} />
            ))}
          </ul>
        ) : (
          <p className="text-small text-muted">{t("controlRoom.inspector.noSwaps")}</p>
        )}
        <p className="text-xs text-muted">{t("common.advisory")}</p>
      </section>

      <div className="flex flex-wrap gap-2">
        <Link to={`/distributor/agents/${agent.agent_id}`} className={LINK}>
          <ExternalLink aria-hidden className="size-4" />
          {t("controlRoom.inspector.detail")}
        </Link>
        <Link to="/distributor/swaps" className={LINK}>
          <ArrowLeftRight aria-hidden className="size-4" />
          {t("controlRoom.inspector.queue")}
        </Link>
      </div>
    </article>
  );
}
