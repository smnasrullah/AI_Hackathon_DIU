import { CircleAlert, CircleCheck, Info, TriangleAlert, X, type LucideIcon } from "lucide-react";
import { AnimatePresence, motion, type PanInfo } from "motion/react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "../../lib/cn";
import { useReducedMotionPref } from "../../lib/motionPrefs";
import { REDUCED, SPRING } from "../../styles/motion";
import { useToastStore, type Toast, type ToastTone } from "./toastStore";

const TONE: Record<ToastTone, { icon: LucideIcon; accent: string }> = {
  success: { icon: CircleCheck, accent: "text-safe-fg" },
  info: { icon: Info, accent: "text-pulse-fg" },
  warning: { icon: TriangleAlert, accent: "text-watch-fg" },
  error: { icon: CircleAlert, accent: "text-act-fg" },
};

const SWIPE_PX = 80;

function ToastCard({ toast }: { toast: Toast }) {
  const { t } = useTranslation();
  const dismiss = useToastStore((s) => s.dismiss);
  const reduced = useReducedMotionPref();
  const { icon: Icon, accent } = TONE[toast.tone];

  useEffect(() => {
    if (!toast.duration) return;
    const id = window.setTimeout(() => dismiss(toast.id), toast.duration);
    return () => window.clearTimeout(id);
  }, [toast.id, toast.duration, dismiss]);

  function onDragEnd(_: unknown, info: PanInfo) {
    if (Math.abs(info.offset.x) > SWIPE_PX) dismiss(toast.id);
  }

  return (
    <motion.li
      layout={!reduced}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, x: 80 }}
      transition={reduced ? REDUCED : SPRING.snappy}
      drag={reduced ? false : "x"}
      dragSnapToOrigin
      onDragEnd={onDragEnd}
      className="glass pointer-events-auto flex w-full items-start gap-3 rounded-2xl border border-line p-3.5 text-fg"
    >
      <Icon aria-hidden className={cn("mt-0.5 size-5 shrink-0", accent)} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{toast.title}</p>
        {toast.body ? <p className="mt-0.5 text-small text-muted">{toast.body}</p> : null}
      </div>
      <button
        type="button"
        onClick={() => dismiss(toast.id)}
        aria-label={t("common.dismiss")}
        className="ap-press -m-1 grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
      >
        <X aria-hidden className="size-4" />
      </button>
    </motion.li>
  );
}

/** Mount once near the app root. Polite live region; swipe sideways to dismiss. */
export function Toasts() {
  const { t } = useTranslation();
  const toasts = useToastStore((s) => s.toasts);
  return (
    <section aria-label={t("toast.region")} className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center p-4 sm:justify-end">
      <ol role="status" aria-live="polite" className="flex w-full max-w-sm flex-col gap-2">
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <ToastCard key={toast.id} toast={toast} />
          ))}
        </AnimatePresence>
      </ol>
    </section>
  );
}
