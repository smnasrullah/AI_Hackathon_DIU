import { useQuery } from "@tanstack/react-query";
import { motion, useScroll, useSpring } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { Reason } from "../../api/types";
import { CountdownCard } from "../../components/signature/CountdownCard";
import { WhyStones } from "../../components/signature/WhyStones";
import { formatPercent } from "../../lib/format";
import { useOnScreen, useReducedMotionPref } from "../../lib/motionPrefs";
import { useLocale } from "../../lib/prefs";
import { fetchSystemStatus, systemStatusKey } from "../../lib/systemStatus";
import { listStagger, revealVariants, SPRING } from "../../styles/motion";
import { CONFIDENCE } from "./demoDay";
import { SwapDemo } from "./SwapDemo";

const START_H = 5 + 20 / 60;
const FLOOR_H = 4;
const TICK_MS = 3000;

/** Countdown that ticks down 10 minutes every few seconds while it is on screen. */
function PredictDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const onScreen = useOnScreen(ref);
  const reduced = useReducedMotionPref();
  const [hours, setHours] = useState(START_H);
  useEffect(() => {
    if (!onScreen || reduced) return;
    const id = window.setInterval(() => setHours((h) => Math.max(FLOOR_H, h - 1 / 6)), TICK_MS);
    return () => window.clearInterval(id);
  }, [onScreen, reduced]);
  return (
    <div ref={ref}>
      <CountdownCard floatType="cash" hoursToStockout={hours} confidence={CONFIDENCE} level="amber" />
    </div>
  );
}

function Step({ kicker, title, body, children, flip }: { kicker: string; title: string; body: string; children: ReactNode; flip?: boolean }) {
  const reduced = useReducedMotionPref();
  const variants = revealVariants(reduced);
  return (
    <motion.li
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.3 }}
      variants={listStagger}
      className="grid items-center gap-6 md:grid-cols-2 md:gap-12"
    >
      <motion.div variants={variants} className={flip ? "md:order-2" : undefined}>
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-pulse-fg">{kicker}</p>
        <h3 className="mt-2 font-display text-h1 font-bold">{title}</h3>
        <p className="mt-3 max-w-md text-body text-muted">{body}</p>
      </motion.div>
      <motion.div variants={variants}>{children}</motion.div>
    </motion.li>
  );
}

/** Predict -> Explain -> Swap, revealed on scroll, with a rail that fills as you read. */
export function LandingStory() {
  const { t } = useTranslation();
  const { digits } = useLocale();
  const reduced = useReducedMotionPref();
  const status = useQuery({ queryKey: systemStatusKey, queryFn: fetchSystemStatus });
  const ref = useRef<HTMLOListElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 75%", "end 60%"] });
  const rail = useSpring(scrollYProgress, SPRING.soft);

  const reasons: Reason[] = [
    { factor: "salary", direction: "up", impact: -42_000, share: 0.46, sentence: t("landing.reasons.salary", { pct: formatPercent(0.38, digits) }) },
    { factor: "hat", direction: "up", impact: -18_000, share: 0.22, sentence: t("landing.reasons.hat") },
    { factor: "refill", direction: "up", impact: -12_000, share: 0.15, sentence: t("landing.reasons.refill") },
  ];

  return (
    <section id="how" aria-labelledby="story-title" className="scroll-mt-6 px-4 py-16 md:px-8 md:py-24">
      <div className="mx-auto max-w-6xl">
        <h2 id="story-title" className="max-w-2xl font-display text-h1 font-bold md:text-display">
          {t("landing.story.title")}
        </h2>
        <div className="relative mt-12 md:pl-10">
          <span aria-hidden className="absolute bottom-0 left-3 top-0 hidden w-0.5 rounded-full bg-line md:block" />
          <motion.span
            aria-hidden
            className="absolute bottom-0 left-3 top-0 hidden w-0.5 origin-top rounded-full bg-brand md:block"
            style={{ scaleY: reduced ? 1 : rail }}
          />
          <ol ref={ref} className="space-y-16 md:space-y-24">
            <Step kicker={t("landing.story.predictKicker")} title={t("landing.story.predictTitle")} body={t("landing.story.predictBody")}>
              <PredictDemo />
            </Step>
            <Step kicker={t("landing.story.explainKicker")} title={t("landing.story.explainTitle")} body={t("landing.story.explainBody")} flip>
              <WhyStones reasons={reasons} generatedBy="template" modelVersion={status.data?.model_version ?? "demo"} />
            </Step>
            <Step kicker={t("landing.story.swapKicker")} title={t("landing.story.swapTitle")} body={t("landing.story.swapBody")}>
              <SwapDemo />
            </Step>
          </ol>
        </div>
      </div>
    </section>
  );
}
