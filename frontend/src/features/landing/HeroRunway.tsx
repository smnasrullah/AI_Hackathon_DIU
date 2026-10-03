import { Flag, Wallet } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useId } from "react";
import { useTranslation } from "react-i18next";

import { RISK_STYLE } from "../../components/ui/risk";
import { formatClock, formatMoney, formatPercent, type Digits } from "../../lib/format";
import { useReducedMotionPref } from "../../lib/motionPrefs";
import { useLocale } from "../../lib/prefs";
import { DUR, SPRING, tween } from "../../styles/motion";
import type { Lang } from "../auth/types";
import {
  bandAt,
  CAPACITY,
  CONFIDENCE,
  dayPos,
  DAY_END_MIN,
  DAY_START_MIN,
  dhakaDate,
  expectedAt,
  riskAt,
  SALARY,
  STEP_MIN,
  STOCKOUT_MIN,
} from "./demoDay";

const VW = 640;
const VH = 200;
const PAD_T = 34;
const PAD_B = 6;
const TICKS = [8, 11, 14, 17, 20].map((h) => h * 60);

const x = (min: number) => dayPos(min) * VW;
const yRatio = (v: number) => (PAD_T + (1 - v / CAPACITY) * (VH - PAD_T - PAD_B)) / VH;
const y = (v: number) => yRatio(v) * VH;

function samples(): number[] {
  const out: number[] = [];
  for (let m = DAY_START_MIN; m <= DAY_END_MIN; m += STEP_MIN) out.push(m);
  return out;
}
const MINUTES = samples();
const LINE = MINUTES.map((m, i) => `${i ? "L" : "M"}${x(m).toFixed(1)} ${y(expectedAt(m)).toFixed(1)}`).join(" ");
const BAND =
  MINUTES.map((m, i) => `${i ? "L" : "M"}${x(m).toFixed(1)} ${y(bandAt(m).high).toFixed(1)}`).join(" ") +
  [...MINUTES]
    .reverse()
    .map((m) => ` L${x(m).toFixed(1)} ${y(bandAt(m).low).toFixed(1)}`)
    .join("") +
  " Z";

/** "8 AM" / "সকাল ৮টা". */
function hourLabel(min: number, lang: Lang, digits: Digits): string {
  return formatClock(dhakaDate(min), lang, digits).replace(/:(00|০০)/, lang === "bn" ? "টা" : "");
}

interface HeroRunwayProps {
  minute: number;
  onScrub: (minute: number) => void;
}

/** Day runway: fan band, past solid / forecast dashed, salary ribbon, stockout flag; a range input scrubs it. */
export function HeroRunway({ minute, onScrub }: HeroRunwayProps) {
  const { t } = useTranslation();
  const { lang, digits } = useLocale();
  const reduced = useReducedMotionPref();
  const uid = useId().replace(/:/g, "");
  const pos = dayPos(minute);
  const cx = pos * VW;
  const dry = minute >= STOCKOUT_MIN;
  const level = riskAt(minute);
  const stockoutClock = formatClock(dhakaDate(STOCKOUT_MIN), lang, digits);
  const valueText = t("landing.scrubValue", {
    clock: formatClock(dhakaDate(minute), lang, digits),
    balance: formatMoney(expectedAt(minute), digits, { lang }),
    risk: t(`risk.${level}`),
  });

  return (
    <div>
      <div className="relative h-44 overflow-hidden rounded-[var(--radius-input)] border border-line bg-surface/70 has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-pulse md:h-52">
        {/* Salary ribbon */}
        <motion.div
          aria-hidden
          className="absolute top-2 flex items-center gap-1 overflow-hidden whitespace-nowrap rounded-full bg-pulse/15 px-2 py-0.5 text-xs font-semibold text-pulse-fg"
          style={{ left: `${dayPos(SALARY.startMin) * 100}%`, width: `${(dayPos(SALARY.endMin) - dayPos(SALARY.startMin)) * 100}%` }}
          initial={reduced ? { opacity: 0 } : { opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={tween(DUR.slow, 0.5)}
        >
          <Wallet className="size-3.5 shrink-0" />
          {t("landing.salary")}
        </motion.div>

        <div className="absolute inset-x-2 inset-y-0" data-plot>
          <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none" aria-hidden className="absolute inset-0 size-full">
            <defs>
              <clipPath id={`${uid}-past`}>
                <rect x="0" y="0" width={cx} height={VH} />
              </clipPath>
              <clipPath id={`${uid}-future`}>
                <rect x={cx} y="0" width={VW - cx} height={VH} />
              </clipPath>
            </defs>
            {TICKS.map((m) => (
              <line key={m} x1={x(m)} x2={x(m)} y1={PAD_T - 4} y2={VH} stroke="var(--line)" vectorEffect="non-scaling-stroke" />
            ))}
            <line x1="0" x2={VW} y1={y(0)} y2={y(0)} stroke="var(--line-strong)" vectorEffect="non-scaling-stroke" />
            <path d={BAND} fill="var(--float-cash)" opacity="0.14" clipPath={`url(#${uid}-future)`} />
            <motion.path
              d={LINE}
              fill="none"
              stroke="var(--float-cash)"
              strokeWidth="3"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              clipPath={`url(#${uid}-past)`}
              initial={{ pathLength: reduced ? 1 : 0 }}
              animate={{ pathLength: 1 }}
              transition={tween(DUR.draw)}
            />
            <motion.path
              d={LINE}
              fill="none"
              stroke="var(--float-cash)"
              strokeWidth="2"
              strokeDasharray="6 6"
              vectorEffect="non-scaling-stroke"
              clipPath={`url(#${uid}-future)`}
              initial={{ opacity: reduced ? 1 : 0 }}
              animate={{ opacity: 0.9 }}
              transition={tween(DUR.slow, DUR.draw)}
            />
            <line
              x1={x(STOCKOUT_MIN)}
              x2={x(STOCKOUT_MIN)}
              y1={PAD_T - 4}
              y2={VH}
              stroke="var(--risk-act)"
              strokeDasharray="3 5"
              strokeOpacity={dry ? 0.9 : 0.5}
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {/* Time cursor: moves by transform only. */}
          <div aria-hidden className="pointer-events-none absolute inset-0" style={{ transform: `translateX(${pos * 100}%)` }}>
            <span className="absolute inset-y-0 left-0 w-0.5 -translate-x-1/2 bg-fg/70" />
            <div className="absolute inset-0" style={{ transform: `translateY(${yRatio(expectedAt(minute)) * 100}%)` }}>
              <span
                className="absolute left-0 top-0 block size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface shadow-soft"
                style={{ background: RISK_STYLE[level].stroke }}
              />
            </div>
          </div>

          <AnimatePresence>
            {dry ? (
              <motion.div
                key="flag"
                aria-hidden
                className="absolute flex -translate-x-full items-center gap-1 whitespace-nowrap rounded-full bg-act-solid px-2 py-1 text-xs font-semibold text-white shadow-soft"
                style={{ left: `${dayPos(STOCKOUT_MIN) * 100}%`, top: "38%" }}
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: -28 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={reduced ? tween(DUR.fast) : SPRING.bounce}
              >
                <Flag className="size-3.5" />
                <span className="num">{t("landing.stockout", { clock: stockoutClock, confidence: formatPercent(CONFIDENCE, digits) })}</span>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <input
            type="range"
            min={DAY_START_MIN}
            max={DAY_END_MIN}
            step={STEP_MIN}
            value={minute}
            onChange={(e) => onScrub(Number(e.target.value))}
            aria-label={t("landing.scrubLabel")}
            aria-valuetext={valueText}
            data-testid="hero-scrub"
            className="absolute inset-0 size-full cursor-ew-resize appearance-none opacity-0"
          />
        </div>
      </div>

      <div aria-hidden className="relative mx-2 mt-1.5 h-5 text-xs text-muted">
        {TICKS.map((m, i) => (
          <span
            key={m}
            className="num absolute top-0 whitespace-nowrap"
            style={{ left: `${dayPos(m) * 100}%`, transform: i === 0 ? undefined : "translateX(-50%)" }}
          >
            {hourLabel(m, lang, digits)}
          </span>
        ))}
      </div>
    </div>
  );
}
