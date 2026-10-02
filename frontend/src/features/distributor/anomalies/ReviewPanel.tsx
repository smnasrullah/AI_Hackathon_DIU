import { CircleCheck, CircleSlash, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useReviewAnomaly } from "../../../api/hooks/anomalies";
import type { AnomalyDetail } from "../../../api/types";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { LiquidButton } from "../../../components/ui/LiquidButton";
import { TimeText } from "../../../components/ui/TimeText";
import { toast } from "../../../components/ui/toastStore";
import { errorCode, NOTE_MIN } from "../decisionNote";
import { AnomalyStatusBadge } from "./AnomalyStatusBadge";

type Decision = "confirmed" | "dismissed";

/** Human review with a required note (audit_log). Reviewing changes nothing else. */
export function ReviewPanel({ anomaly }: { anomaly: AnomalyDetail }) {
  const { t } = useTranslation();
  const [decision, setDecision] = useState<Decision | null>(null);
  const review = useReviewAnomaly();

  function submit(note: string): void {
    if (!decision) return;
    review.mutate(
      { id: anomaly.id, body: { decision, note } },
      {
        onSuccess: () => {
          toast({ tone: "success", title: t(`anomalies.review.done.${decision}`) });
          setDecision(null);
        },
        onError: (err) => {
          const code = errorCode(err);
          toast({ tone: "error", title: t(code === "already_reviewed" ? "anomalies.review.already" : "anomalies.review.failed") });
          setDecision(null);
        },
      },
    );
  }

  if (anomaly.status !== "open") {
    return (
      <section className="rounded-[var(--radius-card)] border border-line bg-surface-2 p-4" data-testid="review-result">
        <div className="flex flex-wrap items-center gap-2">
          <AnomalyStatusBadge status={anomaly.status} />
          <span className="text-xs text-muted">
            {anomaly.reviewed_by ?? ""}
            {anomaly.reviewed_at ? (
              <>
                {" · "}
                <TimeText at={anomaly.reviewed_at} mode="datetime" />
              </>
            ) : null}
          </span>
        </div>
        {anomaly.note ? <p className="mt-2 border-l-2 border-line-strong pl-2 text-small">{anomaly.note}</p> : null}
      </section>
    );
  }

  return (
    <section aria-labelledby="review-title" className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
      <h3 id="review-title" className="font-display text-h2 font-bold">
        {t("anomalies.review.title")}
      </h3>
      <p className="mt-1 text-small text-muted">{t("anomalies.review.lead")}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <LiquidButton variant="danger" icon={CircleCheck} onClick={() => setDecision("confirmed")} data-testid="review-confirm">
          {t("anomalies.review.confirm")}
        </LiquidButton>
        <LiquidButton variant="secondary" icon={CircleSlash} onClick={() => setDecision("dismissed")} data-testid="review-dismiss">
          {t("anomalies.review.dismiss")}
        </LiquidButton>
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
        <ShieldCheck aria-hidden className="size-3.5" />
        {t("anomalies.review.notice")}
      </p>
      <ConfirmDialog
        open={decision !== null}
        onOpenChange={(open) => (open ? undefined : setDecision(null))}
        title={t(`anomalies.review.dialog.${decision ?? "confirmed"}.title`)}
        description={t(`anomalies.review.dialog.${decision ?? "confirmed"}.body`, { name: anomaly.agent.name })}
        confirmLabel={t(`anomalies.review.dialog.${decision ?? "confirmed"}.action`)}
        tone={decision === "confirmed" ? "danger" : "default"}
        noteMinLength={NOTE_MIN}
        pending={review.isPending}
        onConfirm={submit}
      />
    </section>
  );
}
