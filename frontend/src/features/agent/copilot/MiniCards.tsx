import { ArrowLeftRight, BookOpen, ChartLine, ChevronRight, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useAgentSummary } from "../../../api/hooks/agents";
import type { CopilotMeta } from "../../../api/services/copilot";
import { RiskPill } from "../../../components/ui/RiskPill";
import { Skeleton } from "../../../components/ui/Skeleton";
import { formatClock, formatPercent } from "../../../lib/format";
import { useLocale } from "../../../lib/prefs";
import { FLOATS, stockoutFlag } from "../runwayModel";
import { useMyAgentId } from "../useAgentData";

/** Structured card under an answer, picked by the backend's route. Numbers come from the API, not the text. */
export function MiniCard({ meta }: { meta: CopilotMeta }) {
  switch (meta.route) {
    case "status":
    case "forecast_window":
      return <FloatsCard />;
    case "whatif":
      return <ActionCard to="/agent/what-if" icon={SlidersHorizontal} label="copilot.card.whatIf" />;
    case "swap_status":
      return <ActionCard to="/agent/rebalance" icon={ArrowLeftRight} label="copilot.card.rebalance" />;
    case "howto":
      return <SourcesCard sources={meta.sources} />;
    default:
      return null;
  }
}

type CardLabel = "copilot.card.whatIf" | "copilot.card.rebalance" | "copilot.card.forecast";

function ActionCard({ to, icon: Icon, label }: { to: string; icon: LucideIcon; label: CardLabel }) {
  const { t } = useTranslation();
  return (
    <Link
      to={to}
      data-testid="copilot-card-action"
      className="mt-3 flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 text-small font-semibold hover:bg-surface-3"
    >
      <Icon aria-hidden className="size-4 text-pulse-fg" />
      <span className="flex-1">{t(label)}</span>
      <ChevronRight aria-hidden className="size-4 text-muted" />
    </Link>
  );
}

function FloatsCard() {
  const { t } = useTranslation();
  const { lang, digits } = useLocale();
  const summary = useAgentSummary(useMyAgentId());
  if (summary.isError) return null;
  if (!summary.data) return <Skeleton className="mt-3 h-20" />;
  const floats = FLOATS.flatMap((ft) => summary.data.floats.filter((f) => f.float_type === ft));

  return (
    <div data-testid="copilot-card-floats" className="mt-3 rounded-xl border border-line bg-surface-2 p-3">
      <ul className="space-y-2">
        {floats.map((f) => {
          const flag = stockoutFlag(f);
          return (
            <li key={f.float_type} className="num flex items-center justify-between gap-2 text-small">
              <span className="font-semibold">{t(`float.${f.float_type}`)}</span>
              <span className="flex-1 truncate text-right text-muted">
                {flag
                  ? t("copilot.card.runsOut", { time: formatClock(new Date(flag.at), lang, digits), confidence: formatPercent(flag.confidence, digits) })
                  : t("copilot.card.lasts")}
              </span>
              <RiskPill level={f.level} size="sm" />
            </li>
          );
        })}
      </ul>
      <ActionCard to="/agent/forecast" icon={ChartLine} label="copilot.card.forecast" />
    </div>
  );
}

function SourcesCard({ sources }: { sources: CopilotMeta["sources"] }) {
  const { t } = useTranslation();
  if (sources.length === 0) return null;
  return (
    <div data-testid="copilot-card-sources" className="mt-3 rounded-xl border border-line bg-surface-2 p-3 text-small">
      <p className="flex items-center gap-1.5 font-semibold">
        <BookOpen aria-hidden className="size-4 text-pulse-fg" />
        {t("copilot.card.sources")}
      </p>
      <ul className="mt-1.5 list-disc space-y-0.5 pl-6 text-muted">
        {sources.map((s) => (
          <li key={s.slug}>{s.title}</li>
        ))}
      </ul>
    </div>
  );
}
