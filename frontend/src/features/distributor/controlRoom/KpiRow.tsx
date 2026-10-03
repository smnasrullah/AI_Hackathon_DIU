import { ArrowLeftRight, RotateCw, ScanSearch } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useAnomalies } from "../../../api/hooks/anomalies";
import { useSwaps } from "../../../api/hooks/swaps";
import type { MapAgent, RiskLevel } from "../../../api/types";
import { BentoTile } from "../../../components/signature/BentoTile";
import { SkeletonCard } from "../../../components/ui/Skeleton";
import { StaggerGroup } from "../../../components/ui/Stagger";
import { RISK_STYLE } from "../../../components/ui/risk";
import { cn } from "../../../lib/cn";
import { localizeDigits } from "../../../lib/format";
import { useLocale } from "../../../lib/prefs";
import { levelCounts } from "./controlRoomModel";
import { ALL_LEVELS, useControlRoomStore } from "./controlRoomStore";

const WRAP = "block h-full w-full rounded-[var(--radius-card)] text-left outline-none focus-visible:ring-2 focus-visible:ring-pulse";

interface TileQuery {
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  refetch: () => unknown;
}

function TileState({ q, children }: { q: TileQuery; children: ReactNode }) {
  const { t } = useTranslation();
  if (q.isPending) return <SkeletonCard className="h-full" />;
  if (q.isError) {
    return (
      <div role="alert" className="flex h-full flex-col items-start justify-between gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-5">
        <p className="text-small text-muted">{t("state.errorTitle")}</p>
        <button type="button" onClick={() => void q.refetch()} className="ap-press inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-small font-semibold">
          <RotateCw aria-hidden className={cn("size-4", q.isFetching && "animate-spin")} />
          {t("common.retry")}
        </button>
      </div>
    );
  }
  return <>{children}</>;
}

interface KpiRowProps {
  agents: MapAgent[];
  mapQuery: TileQuery;
  hour: number;
}

/** Act now / Watch / Safe at the scrubbed hour (tap to filter), pending swaps, open anomalies. */
export function KpiRow({ agents, mapQuery, hour }: KpiRowProps) {
  const { t } = useTranslation();
  const { digits } = useLocale();
  const levels = useControlRoomStore((s) => s.levels);
  const setLevels = useControlRoomStore((s) => s.setLevels);
  const swaps = useSwaps({ status: "pending", page_size: 1 });
  const anomalies = useAnomalies({ status: "open", page_size: 1 });
  const counts = levelCounts(agents);
  const at = localizeDigits(t("scrubber.offset", { hours: hour }), digits);

  function focusLevel(level: RiskLevel): void {
    const only = levels.length === 1 && levels[0] === level;
    setLevels(only ? [...ALL_LEVELS] : [level]);
  }

  return (
    <StaggerGroup role="region" aria-label={t("controlRoom.kpi.label")} className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5" data-testid="kpi-row">
      {ALL_LEVELS.map((level) => (
        <TileState key={level} q={mapQuery}>
          <button
            type="button"
            className={WRAP}
            aria-pressed={levels.length === 1 && levels[0] === level}
            onClick={() => focusLevel(level)}
            data-testid={`kpi-${level}`}
            data-count={counts[level]}
          >
            <BentoTile
              title={t(`risk.${level}`)}
              value={counts[level]}
              icon={RISK_STYLE[level].icon}
              tone={level}
              className="h-full"
              footer={<span className="text-xs text-muted">{t("controlRoom.kpi.atHour", { at })}</span>}
            />
          </button>
        </TileState>
      ))}
      <TileState q={swaps}>
        <Link to="/distributor/swaps" className={WRAP} data-testid="kpi-swaps">
          <BentoTile
            title={t("controlRoom.kpi.pendingSwaps")}
            value={swaps.data?.total ?? 0}
            icon={ArrowLeftRight}
            className="h-full"
            footer={<span className="text-xs text-muted">{t("controlRoom.kpi.swapsHint")}</span>}
          />
        </Link>
      </TileState>
      <TileState q={anomalies}>
        <Link to="/distributor/anomalies" className={WRAP} data-testid="kpi-anomalies">
          <BentoTile
            title={t("controlRoom.kpi.openAnomalies")}
            value={anomalies.data?.total ?? 0}
            icon={ScanSearch}
            className="h-full"
            footer={<span className="text-xs text-muted">{t("controlRoom.kpi.anomaliesHint")}</span>}
          />
        </Link>
      </TileState>
    </StaggerGroup>
  );
}
