import { motion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useUpdatePreferences } from "../../api/hooks/users";
import { LiquidButton } from "../../components/ui/LiquidButton";
import { useAuthStore } from "../../features/auth/authStore";
import { formatNumber } from "../../lib/format";
import { useReducedMotionPref } from "../../lib/motionPrefs";
import { useLocale } from "../../lib/prefs";
import { REDUCED, SPRING } from "../../styles/motion";
import { useShellStore } from "./shellStore";

const STEPS = ["brand", "search", "bell", "nav", "account"] as const;
type Step = (typeof STEPS)[number];
const PAD = 8;
const CARD_W = 320;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function targetOf(step: Step): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${step}"]`));
  return all.find((el) => el.getClientRects().length > 0) ?? all[0] ?? null;
}

function measure(step: Step): Box | null {
  const r = targetOf(step)?.getBoundingClientRect();
  if (!r) return null;
  return { x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 };
}

/** Spotlight tour over the shell: once per user (tour_done), replayable from Help / Settings. */
export function OnboardingTour() {
  const user = useAuthStore((s) => s.user);
  const replay = useShellStore((s) => s.tourReplay);
  const open = replay || (user !== null && !user.tour_done);
  return open ? <Tour key={replay ? "replay" : "first"} /> : null;
}

function Tour() {
  const { t } = useTranslation();
  const { digits } = useLocale();
  const reduced = useReducedMotionPref();
  const save = useUpdatePreferences();
  const titleId = useId();
  const nextRef = useRef<HTMLButtonElement>(null);
  // Start with every step so the tour is there on first paint; drop missing targets next frame.
  const [steps, setSteps] = useState<Step[]>([...STEPS]);
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [view, setView] = useState({ w: 0, h: 0 });
  const step = steps[index];

  useEffect(() => {
    const frame = requestAnimationFrame(() => setSteps(STEPS.filter((s) => targetOf(s) !== null)));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!step) return;
    const update = () => {
      setBox(measure(step));
      setView({ w: window.innerWidth, h: window.innerHeight });
    };
    const frame = requestAnimationFrame(update);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    nextRef.current?.focus();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [step]);

  function finish(): void {
    useShellStore.getState().setTourReplay(false);
    if (useAuthStore.getState().user?.tour_done === false) save.mutate({ tour_done: true });
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!step) return null;
  const last = index === steps.length - 1;
  const spring = reduced ? { duration: 0 } : SPRING.snappy;
  const below = box ? box.y + box.h + 12 + 180 < view.h : true;
  const cardTop = box ? (below ? box.y + box.h + 12 : Math.max(12, box.y - 12 - 180)) : view.h / 3;
  const cardLeft = box ? Math.min(Math.max(12, box.x + box.w / 2 - CARD_W / 2), Math.max(12, view.w - CARD_W - 12)) : 12;

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-labelledby={titleId} data-testid="onboarding-tour">
      <svg className="absolute inset-0 size-full" aria-hidden>
        <defs>
          <mask id={`${titleId}-mask`}>
            <rect width="100%" height="100%" fill="white" />
            {box ? (
              <motion.rect animate={{ x: box.x, y: box.y, width: box.w, height: box.h }} initial={false} transition={spring} rx="16" fill="black" />
            ) : null}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(10,15,31,0.62)" mask={`url(#${titleId}-mask)`} />
        {box ? (
          <motion.rect
            animate={{ x: box.x, y: box.y, width: box.w, height: box.h }}
            initial={false}
            transition={spring}
            rx="16"
            fill="none"
            stroke="var(--upay-yellow)"
            strokeWidth="2"
          />
        ) : null}
      </svg>
      <motion.div
        key={step}
        initial={reduced ? { opacity: 0, x: cardLeft, y: cardTop } : { opacity: 0, x: cardLeft, y: cardTop + 8 }}
        animate={{ opacity: 1, x: cardLeft, y: cardTop }}
        transition={reduced ? REDUCED : SPRING.soft}
        style={{ width: view.w ? Math.min(CARD_W, view.w - 24) : CARD_W }}
        className="absolute left-0 top-0 rounded-[var(--radius-card)] border border-line bg-surface p-5 text-fg shadow-lift"
      >
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">
          {t("tour.step", { n: formatNumber(index + 1, digits), total: formatNumber(steps.length, digits) })}
        </p>
        <h2 id={titleId} className="mt-1 font-display text-h2 font-bold">
          {t(`tour.${step}Title`)}
        </h2>
        <p className="mt-1 text-small text-muted">{t(`tour.${step}Body`)}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button type="button" onClick={finish} data-testid="tour-skip" className="ap-press min-h-11 rounded-full px-2 text-small text-muted hover:text-fg">
            {t("tour.skip")}
          </button>
          <div className="flex gap-2">
            {index > 0 ? (
              <LiquidButton variant="ghost" size="sm" onClick={() => setIndex(index - 1)}>
                {t("tour.back")}
              </LiquidButton>
            ) : null}
            <LiquidButton ref={nextRef} size="sm" onClick={() => (last ? finish() : setIndex(index + 1))}>
              {last ? t("tour.done") : t("tour.next")}
            </LiquidButton>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
