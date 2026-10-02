import { CalendarDays, CloudRain, Moon, Store, Wallet, type LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";

import { cn } from "../../lib/cn";
import { useReducedMotionPref } from "../../lib/motionPrefs";
import { DUR, STAGGER, tween } from "../../styles/motion";
import { assignLanes } from "./eventLanes";

export type RunwayEventKind = "salary" | "eid" | "hat" | "rain" | "holiday";

export interface RunwayEvent {
  kind: RunwayEventKind;
  startHour: number;
  endHour: number;
  /** Localised event name, shown as the ribbon's tooltip. */
  name?: string;
}

const EVENT_STYLE: Record<RunwayEventKind, { icon: LucideIcon; bg: string }> = {
  salary: { icon: Wallet, bg: "bg-pulse/15 text-pulse-fg" },
  eid: { icon: Moon, bg: "bg-brand/25 text-fg" },
  hat: { icon: Store, bg: "bg-cash/15 text-fg" },
  rain: { icon: CloudRain, bg: "bg-emoney/20 text-fg" },
  holiday: { icon: CalendarDays, bg: "bg-watch/15 text-fg" },
};

const LANE_PX = 28;

interface EventRibbonsProps {
  events: RunwayEvent[];
  hours: number;
  /** Seconds before the first ribbon slides in (after the fan has drawn). */
  delay?: number;
  className?: string;
}

/** Event ribbons (Salary, Eid, Hat-bazar, Rain, Holiday) positioned on the hour axis. */
export function EventRibbons({ events, hours, delay = DUR.draw * 0.6, className }: EventRibbonsProps) {
  const { t } = useTranslation();
  const reduced = useReducedMotionPref();
  const sorted = [...events].sort((a, b) => a.startHour - b.startHour);
  const lanes = assignLanes(sorted);
  const laneCount = Math.max(1, ...lanes.map((l) => l + 1));
  const pct = (h: number) => `${(Math.min(hours, Math.max(0, h)) / hours) * 100}%`;

  return (
    <div className={cn("relative", className)} style={{ height: laneCount * LANE_PX - 4 }} aria-hidden>
      {sorted.map((ev, i) => {
        const { icon: Icon, bg } = EVENT_STYLE[ev.kind];
        const label = t(`runway.event.${ev.kind}`);
        return (
          <motion.div
            key={`${ev.kind}-${ev.startHour}-${i}`}
            title={ev.name ?? label}
            initial={reduced ? { opacity: 0 } : { opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={tween(DUR.slow, delay + i * STAGGER * 2)}
            className={cn("absolute flex h-6 items-center gap-1 overflow-hidden rounded-full px-2 text-[11px] font-semibold", bg)}
            style={{
              top: (lanes[i] ?? 0) * LANE_PX,
              left: pct(ev.startHour),
              width: `calc(${pct(ev.endHour)} - ${pct(ev.startHour)})`,
              minWidth: 28,
            }}
          >
            <Icon className="size-3.5 shrink-0" />
            <span className="truncate">{label}</span>
          </motion.div>
        );
      })}
    </div>
  );
}
