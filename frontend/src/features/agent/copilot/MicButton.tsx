import { Mic, MicOff, Square } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "../../../lib/cn";
import type { SpeechProblem } from "./useSpeechInput";

interface MicButtonProps {
  listening: boolean;
  problem: SpeechProblem | null;
  disabled?: boolean;
  onStart: () => void;
  onStop: () => void;
}

/** Push to talk. With no Web Speech support the button stays, says why, and points to typing. */
export function MicButton({ listening, problem, disabled = false, onStart, onStop }: MicButtonProps) {
  const { t } = useTranslation();
  const Icon = listening ? Square : problem === "unsupported" || problem === "denied" ? MicOff : Mic;
  return (
    <button
      type="button"
      data-testid="copilot-mic"
      aria-pressed={listening}
      aria-label={t(listening ? "copilot.mic.stop" : "copilot.mic.start")}
      disabled={disabled}
      onClick={listening ? onStop : onStart}
      className={cn(
        "relative grid size-11 shrink-0 place-items-center rounded-full border border-line-strong bg-surface text-fg hover:bg-surface-2 disabled:opacity-50",
        listening && "border-act bg-act/12 text-act-fg",
      )}
    >
      {listening ? <span aria-hidden className="ap-loop ap-ping absolute inset-0 rounded-full border border-act opacity-40" /> : null}
      <Icon aria-hidden className="size-5" />
    </button>
  );
}
