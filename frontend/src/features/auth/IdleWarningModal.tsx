import { Clock, LogOut } from "lucide-react";
import { useEffect, useRef } from "react";

interface Props {
  secondsLeft: number;
  onStay: () => void;
  onLogout: () => void;
}

export function IdleWarningModal({ secondsLeft, onStay, onLogout }: Props) {
  const stayRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    stayRef.current?.focus();
  }, []);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[var(--ink-950)]/60 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="idle-title"
        aria-describedby="idle-body"
        onKeyDown={(e) => {
          if (e.key === "Escape") onStay();
        }}
        className="w-full max-w-sm rounded-[var(--radius-card)] border border-line bg-surface p-6 text-fg shadow-lg"
      >
        <div className="flex items-center gap-2 text-risk-amber">
          <Clock className="size-5" aria-hidden />
          <p className="font-mono text-xs uppercase tracking-[0.18em]">Idle</p>
        </div>
        <h2 id="idle-title" className="mt-2 font-display text-2xl font-bold">
          Still there?
        </h2>
        <p id="idle-body" className="mt-2 text-sm text-muted">
          You will be signed out in{" "}
          <span className="font-mono text-fg" aria-live="polite">
            {secondsLeft}s
          </span>{" "}
          to protect this account.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            ref={stayRef}
            type="button"
            onClick={onStay}
            className="ap-press min-h-11 flex-1 rounded-full bg-brand px-4 font-semibold text-[var(--ink-950)]"
          >
            Stay signed in
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="ap-press flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full border border-line px-4 font-semibold"
          >
            <LogOut className="size-4" aria-hidden />
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
