import { useTranslation } from "react-i18next";

import { useHelpSettings, useTriggerSettings } from "../../../api/hooks/helpRequests";
import { useSystemStatus } from "../../../api/hooks/system";
import { PageHeader } from "../../../components/ui/PageHeader";
import { ErrorState } from "../../../components/ui/StatePanel";
import { SkeletonPanel } from "../../../components/ui/Skeleton";
import { DemoShortage } from "./DemoShortage";
import { DryRunPreview } from "./DryRunPreview";
import { PolicyForm } from "./PolicyForm";
import { TriggerForm } from "./TriggerForm";

/** /admin/help-settings: safety switches and limits, a dry-run preview, and (DEMO_MODE only) a shortage simulator. */
export function AdminHelpSettingsPage() {
  const { t } = useTranslation();
  const policy = useHelpSettings();
  const trigger = useTriggerSettings();
  const status = useSystemStatus();
  const demo = status.data?.demo_mode === true;

  return (
    <div className="space-y-8">
      <PageHeader title={t("liquidity.admin.title")} description={t("liquidity.admin.lead")} />

      {policy.isPending || trigger.isPending ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <SkeletonPanel rows={5} />
          <SkeletonPanel rows={5} />
        </div>
      ) : policy.isError || trigger.isError ? (
        <ErrorState
          onRetry={() => {
            void policy.refetch();
            void trigger.refetch();
          }}
          retrying={policy.isFetching || trigger.isFetching}
        />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <PolicyForm data={policy.data} />
          <TriggerForm data={trigger.data} />
        </div>
      )}

      <DryRunPreview />

      {demo ? <DemoShortage /> : null}
    </div>
  );
}
