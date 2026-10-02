import { DatabaseZap, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

import { useFairness, useModelCard } from "../../api/hooks/system";
import type { GroupBy } from "../../api/types";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { SkeletonCard, SkeletonText } from "../../components/ui/Skeleton";
import { SourceChip } from "../../components/ui/SourceChip";
import { ErrorState } from "../../components/ui/StatePanel";
import { formatNumber, localizeDigits } from "../../lib/format";
import { useLocale } from "../../lib/prefs";
import { FairnessChart } from "./FairnessChart";
import { ModelCardAccordion } from "./ModelCardAccordion";

const GROUPS: GroupBy[] = ["urban_rural", "tier", "region"];

function isGroupBy(v: string | null): v is GroupBy {
  return GROUPS.some((g) => g === v);
}

/** Always on screen, never dismissible (DESIGN.md §4). */
function PermanentNotices() {
  const { t } = useTranslation();
  return (
    <div role="note" aria-label={t("rai.noticesLabel")} className="grid gap-2 sm:grid-cols-2" data-testid="rai-notices">
      <p className="flex items-center gap-3 rounded-[var(--radius-card)] border border-safe/40 bg-safe/12 px-4 py-3 font-semibold text-safe-fg">
        <ShieldCheck aria-hidden className="size-5 shrink-0" />
        {t("common.advisory")}
      </p>
      <p className="flex items-center gap-3 rounded-[var(--radius-card)] border border-pulse/40 bg-pulse/12 px-4 py-3 font-semibold text-pulse-fg">
        <DatabaseZap aria-hidden className="size-5 shrink-0" />
        {t("common.synthetic")}
      </p>
    </div>
  );
}

function Fairness({ groupBy }: { groupBy: GroupBy }) {
  const { t } = useTranslation();
  const { digits } = useLocale();
  const q = useFairness(groupBy);
  if (q.isPending) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }
  if (q.isError) return <ErrorState compact onRetry={() => void q.refetch()} retrying={q.isFetching} />;
  const r = q.data;
  const gaps = Object.entries(r.gap.nmae)
    .map(([k, v]) => `${k.replace(/_/g, "-")} ${formatNumber(v, digits, { fraction: 3 })}`)
    .join(", ");
  return (
    <div className="space-y-3">
      <FairnessChart report={r} />
      <p className="num text-xs text-muted" data-testid="fairness-gap">
        {localizeDigits(
          t("rai.gap", {
            nmae: gaps || "–",
            recall: r.gap.recall === null ? "–" : formatNumber(r.gap.recall, digits, { fraction: 3 }),
          }),
          digits,
        )}
      </p>
      <p className="num text-xs text-muted">
        {localizeDigits(t("rai.method", { start: r.method.start, end: r.method.end, hours: r.method.horizon_h, paths: r.method.n_paths }), digits)} ·{" "}
        {r.model_version}
      </p>
    </div>
  );
}

function Card() {
  const { lang } = useLocale();
  const q = useModelCard(lang);
  if (q.isPending) return <SkeletonText lines={6} />;
  if (q.isError) return <ErrorState compact onRetry={() => void q.refetch()} retrying={q.isFetching} />;
  return <ModelCardAccordion card={q.data} />;
}

/** Responsible AI (F12): fairness by group, model card, and the permanent advisory / synthetic notices. */
export function ResponsibleAiPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const raw = params.get("groupBy");
  const groupBy: GroupBy = isGroupBy(raw) ? raw : "urban_rural";

  function choose(next: GroupBy): void {
    const out = new URLSearchParams(params);
    if (next === "urban_rural") out.delete("groupBy");
    else out.set("groupBy", next);
    setParams(out, { replace: true });
  }

  return (
    <div className="space-y-6" data-testid="responsible-ai-page">
      <header>
        <h1 className="font-display text-h1 font-bold">{t("rai.title")}</h1>
        <p className="mt-1 text-small text-muted">{t("rai.lead")}</p>
      </header>
      <PermanentNotices />

      <section aria-labelledby="rai-fairness" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="rai-fairness" className="font-display text-h2 font-bold">
              {t("rai.fairness")}
            </h2>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-small text-muted">
              {t("rai.fairnessLead")}
              <SourceChip source="model" />
            </p>
          </div>
          <SegmentedControl<GroupBy>
            label={t("rai.groupBy")}
            size="sm"
            value={groupBy}
            onChange={choose}
            options={GROUPS.map((g) => ({ value: g, label: t(`rai.group.${g}`) }))}
          />
        </div>
        <Fairness groupBy={groupBy} />
      </section>

      <section aria-labelledby="rai-card" className="space-y-3">
        <h2 id="rai-card" className="font-display text-h2 font-bold">
          {t("rai.cardTitle")}
        </h2>
        <Card />
      </section>
    </div>
  );
}
