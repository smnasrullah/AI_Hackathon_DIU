import { Check, Circle, Clock } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { HelpStatus } from "../../api/types";
import { cn } from "../../lib/cn";
import { timelineStates, type Step, type StepState } from "./helpModel";

const STEPS: Step[] = ["sent", "accepted", "received"];

const ICON: Record<StepState, typeof Check> = { done: Check, current: Clock, todo: Circle };

/** Sent, someone accepted, money received. Each step has an icon and a word, not only a colour. */
export function HelpTimeline({ status }: { status: HelpStatus }) {
  const { t } = useTranslation();
  const states = timelineStates(status);
  return (
    <ol aria-label={t("liquidity.timeline.label")} className="grid grid-cols-3 gap-2" data-testid="help-timeline">
      {STEPS.map((step) => {
        const state = states[step];
        const Icon = ICON[state];
        return (
          <li
            key={step}
            data-step={step}
            data-state={state}
            aria-current={state === "current" ? "step" : undefined}
            className={cn("flex min-w-0 flex-col items-center gap-1 text-center text-xs", state === "todo" ? "text-muted" : "text-fg")}
          >
            <span
              className={cn(
                "grid size-8 place-items-center rounded-full border",
                state === "done" && "border-safe bg-surface-2 text-safe-fg",
                state === "current" && "border-pulse bg-surface-2 text-pulse-fg",
                state === "todo" && "border-line bg-surface text-muted",
              )}
            >
              <Icon aria-hidden className="size-4" />
            </span>
            <span className="font-semibold leading-tight">{t(`liquidity.timeline.${step}`)}</span>
          </li>
        );
      })}
    </ol>
  );
}
