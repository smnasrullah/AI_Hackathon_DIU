import { ArrowLeftRight, Map as MapIcon, RotateCw, ScanSearch, ShieldCheck, Users, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useDistributorBriefing } from "../../../api/hooks/briefing";
import type { LlmText } from "../../../api/types";
import { LiquidButton } from "../../../components/ui/LiquidButton";
import { SkeletonText } from "../../../components/ui/Skeleton";
import { SourceChip } from "../../../components/ui/SourceChip";
import { ErrorState } from "../../../components/ui/StatePanel";
import { TimeText } from "../../../components/ui/TimeText";
import { useLocale } from "../../../lib/prefs";
import { WordingBlock } from "../../agent/home/WordingBlock";

const NEXT: { to: string; label: "controlRoom" | "agents" | "swapQueue" | "anomalies"; icon: LucideIcon }[] = [
  { to: "/distributor", label: "controlRoom", icon: MapIcon },
  { to: "/distributor/agents", label: "agents", icon: Users },
  { to: "/distributor/swaps", label: "swapQueue", icon: ArrowLeftRight },
  { to: "/distributor/anomalies", label: "anomalies", icon: ScanSearch },
];

function Meta({ data }: { data: LlmText }) {
  const { t } = useTranslation();
  const ai = data.generated_by !== "template";
  return (
    <div className="space-y-2 text-xs text-muted">
      <div className="flex flex-wrap items-center gap-2">
        <SourceChip source="model" />
        {ai ? <SourceChip source="ai" /> : null}
        <span>
          {t("briefing.written")} <TimeText at={data.generated_at} mode="datetime" />
        </span>
        {data.model_version ? <span className="num">· {data.model_version}</span> : null}
        {ai && data.model ? <span className="num">· {data.model}</span> : null}
      </div>
      {data.fallback_reason ? <p data-testid="briefing-fallback">{t("briefing.fallback")}</p> : null}
      {data.cited_factors.length ? (
        <p>
          {t("briefing.cited")}{" "}
          <span className="num">{data.cited_factors.map((f) => f.replace(/_/g, " ")).join(", ")}</span>
        </p>
      ) : null}
    </div>
  );
}

/** Daily briefing (LLM): written from today's evidence pack; numbers are checked, template text on any failure. */
export function BriefingPage() {
  const { t } = useTranslation();
  const { lang } = useLocale();
  const q = useDistributorBriefing(lang);

  return (
    <div className="mx-auto max-w-3xl space-y-4" data-testid="briefing-page">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-h1 font-bold">{t("briefing.title")}</h1>
          <p className="mt-1 text-small text-muted">{t("briefing.lead")}</p>
        </div>
        <LiquidButton variant="secondary" size="sm" icon={RotateCw} loading={q.isFetching && !q.isPending} onClick={() => void q.refetch()}>
          {t("briefing.refresh")}
        </LiquidButton>
      </header>

      {q.isPending ? (
        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
          <SkeletonText lines={6} />
        </div>
      ) : q.isError ? (
        <ErrorState onRetry={() => void q.refetch()} retrying={q.isFetching} />
      ) : (
        <article className="space-y-3" data-testid="briefing" data-generated-by={q.data.generated_by}>
          <WordingBlock templateText={q.data.template_text} narration={q.data} pending={false} />
          <Meta data={q.data} />
        </article>
      )}

      <p className="flex items-center gap-1.5 text-xs text-muted">
        <ShieldCheck aria-hidden className="size-3.5" />
        {t("briefing.notice")}
      </p>

      <nav aria-label={t("briefing.next")} className="grid gap-2 sm:grid-cols-2">
        {NEXT.map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to} className="flex min-h-11 items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-small font-semibold hover:bg-surface-2">
            <Icon aria-hidden className="size-4 text-muted" />
            {t(`page.${label}`)}
          </Link>
        ))}
      </nav>
    </div>
  );
}
