import { useTranslation } from "react-i18next";

import { useHelpSettings, useTriggerSettings } from "../../../api/hooks/helpRequests";
import { useSystemStatus } from "../../../api/hooks/system";
import { PageHeader } from "../../../components/ui/PageHeader";
import { ErrorState } from "../../../components/ui/StatePanel";
import { SkeletonPanel } from "../../../components/ui/Skeleton";
import { DemoModePanel } from "./DemoModePanel";
import { DemoShortage } from "./DemoShortage";
import { DryRunPreview } from "./DryRunPreview";
import { PolicyForm } from "./PolicyForm";
import { SchedulerStatusCard } from "./SchedulerStatusCard";
import { TriggerForm } from "./TriggerForm";
import { HELP_ADMIN_NS } from "../../../i18n/helpAdmin";

/** /admin/help-settings: safety switches and limits, a dry-run preview, and (DEMO_MODE only) a shortage simulator. */
export function AdminHelpSettingsPage() {
  const { t: th } = useTranslation(HELP_ADMIN_NS);
  const policy = useHelpSettings();
  const trigger = useTriggerSettings();
  const status = useSystemStatus();
  const demo = status.data?.demo_mode === true;

  return (
    <div className="space-y-8">
      <PageHeader title={th("title")} description={th("lead")} />

      {demo ? <DemoModePanel /> : null}

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

      <SchedulerStatusCard />

      <DryRunPreview />

      {demo ? <DemoShortage /> : null}
    </div>
  );
}
