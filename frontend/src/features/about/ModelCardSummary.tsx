import { Boxes } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useModelCard } from "../../api/hooks/system";
import { SkeletonText } from "../../components/ui/Skeleton";
import { ErrorState } from "../../components/ui/StatePanel";
import { TimeText } from "../../components/ui/TimeText";
import { localizeDigits } from "../../lib/format";
import { useLocale } from "../../lib/prefs";
import { Section } from "../account/Section";

function List({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="text-small font-semibold">{title}</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-small text-muted">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

/** Active models + intended use + limits from GET /responsible-ai/model-card (server text in bn/en). */
export function ModelCardSummary() {
  const { t } = useTranslation();
  const { lang, digits } = useLocale();
  const q = useModelCard(lang);

  return (
    <Section title={t("about.modelCardTitle")}>
      {q.isPending ? (
        <SkeletonText lines={5} />
      ) : q.isError ? (
        <ErrorState compact onRetry={() => void q.refetch()} retrying={q.isFetching} />
      ) : (
        <div className="space-y-5">
          <div>
            <h3 className="text-small font-semibold">{t("about.models")}</h3>
            <ul className="mt-2 grid gap-3 sm:grid-cols-2">
              {q.data.models.map((m) => (
                <li key={`${m.name}-${m.version}`} className="rounded-2xl border border-line bg-bg p-4">
                  <p className="flex items-center gap-2 font-semibold">
                    <Boxes aria-hidden className="size-4 text-pulse-fg" />
                    {m.name}
                  </p>
                  <p className="mt-1 text-small text-muted">{m.purpose}</p>
                  <p className="mt-2 text-xs text-muted">
                    {t("about.version")} <span className="num">{localizeDigits(m.version, digits)}</span> · {t("about.trained")}{" "}
                    <TimeText at={m.trained_at} mode="datetime" />
                  </p>
                </li>
              ))}
            </ul>
          </div>
          <List title={t("about.intended")} items={q.data.intended_use} />
          <List title={t("about.outOfScope")} items={q.data.out_of_scope} />
          <List title={t("about.limitsTitle")} items={q.data.limitations} />
        </div>
      )}
    </Section>
  );
}
