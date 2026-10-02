import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { useFreshness, useSystemStatus } from "../../api/hooks/system";
import { SkeletonText } from "../../components/ui/Skeleton";
import { ErrorState } from "../../components/ui/StatePanel";
import { TimeText } from "../../components/ui/TimeText";
import { formatNumber, localizeDigits } from "../../lib/format";
import { useLocale } from "../../lib/prefs";
import { APP_VERSION } from "../../lib/version";
import { Section } from "../account/Section";

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
      <dt className="text-small text-muted">{label}</dt>
      <dd className="num text-small font-semibold">{children}</dd>
    </div>
  );
}

export function VersionInfo() {
  const { t } = useTranslation();
  const { digits } = useLocale();
  const status = useSystemStatus();
  const fresh = useFreshness();
  const v = (s: string | null | undefined) => (s ? localizeDigits(s, digits) : "—");

  return (
    <Section title={t("about.versionTitle")}>
      {status.isPending || fresh.isPending ? (
        <SkeletonText lines={5} />
      ) : status.isError || fresh.isError ? (
        <ErrorState
          compact
          onRetry={() => {
            void status.refetch();
            void fresh.refetch();
          }}
          retrying={status.isFetching || fresh.isFetching}
        />
      ) : (
        <dl className="divide-y divide-line">
          <Fact label={t("about.appVersion")}>{v(APP_VERSION)}</Fact>
          <Fact label={t("about.dataVersion")}>{v(status.data.data_version)}</Fact>
          <Fact label={t("about.modelVersion")}>{v(fresh.data.model_version ?? status.data.model_version)}</Fact>
          <Fact label={t("about.llmMode")}>{t(`llmMode.${fresh.data.llm_mode}`)}</Fact>
          <Fact label={t("about.seed")}>{status.data.seed === null ? "—" : formatNumber(status.data.seed, digits)}</Fact>
          <Fact label={t("about.dataWindow")}>
            <TimeText at={fresh.data.data_period.start} mode="datetime" /> – <TimeText at={fresh.data.data_period.end} mode="datetime" />
          </Fact>
          <Fact label={t("about.holdout")}>
            <TimeText at={fresh.data.data_period.holdout_start} mode="datetime" />
          </Fact>
        </dl>
      )}
    </Section>
  );
}
