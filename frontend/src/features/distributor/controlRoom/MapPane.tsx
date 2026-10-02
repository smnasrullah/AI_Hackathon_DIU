import { Droplets, FilterX, Globe } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useState, type ComponentType, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { MapAgent, MapSwap } from "../../../api/types";
import { Skeleton } from "../../../components/ui/Skeleton";
import { EmptyState, ErrorState } from "../../../components/ui/StatePanel";
import { RISK_STYLE } from "../../../components/ui/risk";
import { cn } from "../../../lib/cn";
import { ALL_LEVELS, useControlRoomStore } from "./controlRoomStore";
import type { RiskMapProps } from "./RiskMap";

/** If the map chunk cannot load (offline after a deploy), report it like a WebGL failure. */
function MapLoadFailed({ onFail }: RiskMapProps) {
  useEffect(() => onFail(), [onFail]);
  return null;
}

const RiskMap = lazy(
  (): Promise<{ default: ComponentType<RiskMapProps> }> => import("./RiskMap").catch(() => ({ default: MapLoadFailed })),
);

const OVERLAY = "glass rounded-2xl px-3 py-2 text-xs text-fg";

interface MapPaneProps {
  agents: MapAgent[];
  swaps: MapSwap[];
  status: "pending" | "error" | "ready";
  onRetry: () => void;
  retrying: boolean;
  /** The summary read by screen readers ("12 agents: 3 act now..."). */
  summary: string;
  scrubber: ReactNode;
  className?: string;
}

function Legend() {
  const { t } = useTranslation();
  return (
    <ul className={cn(OVERLAY, "space-y-1")} aria-label={t("controlRoom.map.legend")}>
      {ALL_LEVELS.map((level) => {
        const Icon = RISK_STYLE[level].icon;
        return (
          <li key={level} className="flex items-center gap-2">
            <span aria-hidden className="size-2.5 rounded-full" style={{ background: RISK_STYLE[level].stroke, boxShadow: `0 0 8px ${RISK_STYLE[level].stroke}` }} />
            <Icon aria-hidden className={cn("size-3.5", RISK_STYLE[level].fg)} />
            {t(`risk.${level}`)}
          </li>
        );
      })}
      <li className="flex items-center gap-2">
        <Droplets aria-hidden className="size-3.5 text-emoney" />
        {t("controlRoom.map.swapFlow")}
      </li>
    </ul>
  );
}

/** Centre pane: lazily loaded MapLibre map with legend, online-tiles toggle and the time scrubber. */
export function MapPane({ agents, swaps, status, onRetry, retrying, summary, scrubber, className }: MapPaneProps) {
  const { t } = useTranslation();
  const selectedId = useControlRoomStore((s) => s.selectedId);
  const select = useControlRoomStore((s) => s.select);
  const onlineTiles = useControlRoomStore((s) => s.onlineTiles);
  const setOnlineTiles = useControlRoomStore((s) => s.setOnlineTiles);
  const resetFilters = useControlRoomStore((s) => s.resetFilters);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const onFail = useCallback(() => setFailed(true), []);

  return (
    <section
      aria-labelledby="map-heading"
      className={cn("relative isolate min-h-[420px] overflow-hidden rounded-[var(--radius-card)] border border-line bg-[#0A0F1F] shadow-lift", className)}
    >
      <h2 id="map-heading" className="sr-only">
        {t("controlRoom.map.title")}
      </h2>
      {failed ? (
        <div className="absolute inset-0 grid place-items-center p-6">
          <ErrorState
            compact
            title={t("controlRoom.map.failTitle")}
            body={t("controlRoom.map.failBody")}
            onRetry={() => {
              setFailed(false);
              setAttempt((n) => n + 1);
            }}
          />
        </div>
      ) : (
        <Suspense fallback={<Skeleton className="absolute inset-0 rounded-none" />}>
          <RiskMap
            key={attempt}
            agents={agents}
            swaps={swaps}
            selectedId={selectedId}
            onSelect={select}
            onlineTiles={onlineTiles}
            onFail={onFail}
            label={summary}
          />
        </Suspense>
      )}

      <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-col items-start gap-2 [&>*]:pointer-events-auto">
        <Legend />
        <button
          type="button"
          aria-pressed={onlineTiles}
          onClick={() => setOnlineTiles(!onlineTiles)}
          className={cn(OVERLAY, "inline-flex min-h-11 items-center gap-2 font-semibold", onlineTiles && "ring-1 ring-pulse")}
          title={t("controlRoom.map.tilesHint")}
        >
          <Globe aria-hidden className="size-4" />
          {t(onlineTiles ? "controlRoom.map.tilesOn" : "controlRoom.map.tilesOff")}
        </button>
      </div>

      {status === "pending" ? <Skeleton className="absolute inset-0 z-10 rounded-none opacity-60" /> : null}
      {status === "error" ? (
        <div className="absolute inset-0 z-20 grid place-items-center bg-ink-950/50 p-6">
          <ErrorState compact onRetry={onRetry} retrying={retrying} />
        </div>
      ) : null}
      {status === "ready" && agents.length === 0 ? (
        <div className="absolute inset-0 z-20 grid place-items-center p-6">
          <EmptyState
            compact
            title={t("controlRoom.empty.title")}
            body={t("controlRoom.empty.body")}
            action={{ label: t("controlRoom.filters.reset"), icon: FilterX, onClick: resetFilters }}
          />
        </div>
      ) : null}

      <div className="absolute inset-x-3 bottom-3 z-10">{scrubber}</div>
    </section>
  );
}
