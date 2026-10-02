import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useId } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "../../lib/cn";
import { formatClock, localizeDigits } from "../../lib/format";
import { useLocale } from "../../lib/prefs";

/** Playback advances this many hours per tick. */
export const PLAY_STEP_H = 3;
export const PLAY_TICK_MS = 900;
const HOUR_MS = 3_600_000;
const TICKS = [0, 24, 48, 72];

interface TimeScrubberProps {
  hour: number;
  onChange: (hour: number) => void;
  playing: boolean;
  onPlayingChange: (playing: boolean) => void;
  /** Forecast as-of: the clock label is asOf + hour. */
  asOf?: string | null;
  max?: number;
  /** A fetch for the new hour is in flight. */
  busy?: boolean;
  className?: string;
}

/** 0-72h slider with play: the map and list recolour as time moves. */
export function TimeScrubber({ hour, onChange, playing, onPlayingChange, asOf, max = 72, busy = false, className }: TimeScrubberProps) {
  const { t } = useTranslation();
  const { lang, digits } = useLocale();
  const id = useId();

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      const next = Math.min(max, hour + PLAY_STEP_H);
      onChange(next);
      if (next >= max) onPlayingChange(false);
    }, PLAY_TICK_MS);
    return () => window.clearInterval(timer);
  }, [playing, hour, max, onChange, onPlayingChange]);

  function togglePlay(): void {
    if (!playing && hour >= max) onChange(0);
    onPlayingChange(!playing);
  }

  const at = asOf ? new Date(new Date(asOf).getTime() + hour * HOUR_MS) : null;
  const offset = localizeDigits(t("scrubber.offset", { hours: hour }), digits);
  const label = at ? `${offset} · ${formatClock(at, lang, digits)}` : offset;
  const PlayIcon = playing ? Pause : hour >= max ? RotateCcw : Play;

  return (
    <div className={cn("glass flex items-center gap-3 rounded-[var(--radius-card)] px-3 py-2", className)} data-testid="time-scrubber">
      <button
        type="button"
        onClick={togglePlay}
        aria-pressed={playing}
        aria-label={t(playing ? "scrubber.pause" : "scrubber.play")}
        className="grid size-11 shrink-0 place-items-center rounded-full bg-pulse text-on-pulse transition-transform active:scale-[.97]"
      >
        <PlayIcon aria-hidden className="size-5" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor={id} className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            {t("scrubber.label")}
          </label>
          <output htmlFor={id} aria-live="polite" className={cn("num text-small font-semibold", busy && "opacity-70")} data-testid="scrubber-value">
            {label}
          </output>
        </div>
        <input
          id={id}
          type="range"
          min={0}
          max={max}
          step={1}
          value={hour}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-valuetext={label}
          className="mt-1 h-6 w-full cursor-pointer accent-[var(--pulse-blue)]"
        />
        <div aria-hidden className="num flex justify-between text-[11px] text-muted">
          {TICKS.filter((h) => h <= max).map((h) => (
            <span key={h}>{localizeDigits(t("scrubber.offset", { hours: h }), digits)}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
