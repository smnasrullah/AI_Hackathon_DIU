import { Database, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { formatNumber } from "../../lib/format";
import { useLocale } from "../../lib/prefs";
import { Section } from "../account/Section";
import { ModelCardSummary } from "./ModelCardSummary";
import { VersionInfo } from "./VersionInfo";

const STEPS = ["step1", "step2", "step3", "step4"] as const;

/** Methodology: synthetic data, how the forecast works, model card, limits, responsible AI, versions. */
export function AboutPage() {
  const { t } = useTranslation();
  const { digits } = useLocale();
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted">{t("about.eyebrow")}</p>
        <h1 className="mt-1 font-display text-h1 font-bold">{t("page.about")}</h1>
        <p className="mt-2 max-w-prose text-muted">{t("about.lead")}</p>
      </header>

      <Section title={t("about.syntheticTitle")}>
        <p className="flex gap-3 text-small text-muted">
          <Database aria-hidden className="mt-0.5 size-5 shrink-0 text-emoney" />
          {t("about.syntheticBody")}
        </p>
      </Section>

      <Section title={t("about.forecastTitle")}>
        <ol className="space-y-3">
          {STEPS.map((s, i) => (
            <li key={s} className="flex gap-3">
              <span aria-hidden className="num grid size-7 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-semibold">
                {formatNumber(i + 1, digits)}
              </span>
              <span className="text-small">{t(`about.${s}`)}</span>
            </li>
          ))}
        </ol>
        <p className="mt-4 rounded-2xl border border-line bg-bg p-3 text-small text-muted">{t("about.gateNote")}</p>
      </Section>

      <ModelCardSummary />

      <Section title={t("about.limitsTitle")}>
        <p className="text-small text-muted">{t("about.limitsStatic")}</p>
      </Section>

      <Section title={t("about.raiTitle")}>
        <p className="flex gap-3 text-small text-muted">
          <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-safe-fg" />
          {t("about.raiBody")}
        </p>
        <Link to="/responsible-ai" className="mt-3 inline-block text-small font-semibold text-pulse-fg underline underline-offset-2">
          {t("about.raiLink")}
        </Link>
      </Section>

      <VersionInfo />
    </div>
  );
}
