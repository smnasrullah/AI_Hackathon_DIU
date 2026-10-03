import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { qk } from "../../../api/keys";
import { MAP_POLL_MS, useMapAgents } from "../../../api/hooks/map";
import { useMyHelpRequests } from "../../../api/hooks/helpRequests";
import { TimeScrubber } from "../../../components/signature/TimeScrubber";
import { localizeDigits } from "../../../lib/format";
import { useLocale } from "../../../lib/prefs";
import { useDebounced } from "../../../lib/useDebounced";
import { useMediaQuery } from "../../../lib/useMediaQuery";
import { AgentList } from "./AgentList";
import { filterAgents, levelCounts, visibleSwaps } from "./controlRoomModel";
import { useControlRoomStore } from "./controlRoomStore";
import { FilterPanel } from "./FilterPanel";
import { FreshnessStripe } from "./FreshnessStripe";
import { Inspector } from "./Inspector";
import { KpiRow } from "./KpiRow";
import { MapPane } from "./MapPane";
import { helpMapPoints } from "../../liquidity/helpModel";
import { useControlRoomPalette } from "./useControlRoomPalette";

/** Three panes from this width (DESIGN.md §4); below it the page is list + inspector. */
export const DESKTOP_QUERY = "(min-width: 1280px)";
const PANE = "glass min-h-0 rounded-[var(--radius-card)] p-4";

/** KPI counts and swap/anomaly totals follow the same 45 s rhythm as the map (visible tab only). */
function usePolling(): void {
  const client = useQueryClient();
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.hidden) return;
      for (const queryKey of [qk.system.freshness, qk.swaps.all, qk.anomalies.all]) void client.invalidateQueries({ queryKey });
    }, MAP_POLL_MS);
    return () => window.clearInterval(id);
  }, [client]);
}

/** Distributor control room: KPI bento, filters + virtual list, risk map with scrubber, inspector. */
export function ControlRoomPage() {
  const { t } = useTranslation();
  const { digits } = useLocale();
  const client = useQueryClient();
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const { hour, setHour, playing, setPlaying, levels, query, district, float, selectedId, select } = useControlRoomStore();
  // Dragging settles before fetching; playback steps are already spaced out.
  const fetchHour = useDebounced(hour, playing ? 0 : 150);
  const q = useMapAgents(fetchHour);
  // Open help requests of my agents, drawn as pulsing markers at their shops.
  const help = useMyHelpRequests({ status: "open", page_size: 50 });
  usePolling();

  const all = useMemo(() => q.data?.agents ?? [], [q.data]);
  const shown = useMemo(() => filterAgents(all, { levels, query, district, float }), [all, levels, query, district, float]);
  const swaps = useMemo(() => visibleSwaps(q.data?.swaps ?? [], shown), [q.data, shown]);
  const helpPoints = useMemo(() => helpMapPoints(help.data?.items ?? [], all), [help.data, all]);
  const selected = all.find((a) => a.agent_id === selectedId) ?? null;
  const riskiest = shown[0] ?? null;
  const dataHour = q.data?.at_hour ?? hour;
  const status = q.isPending ? "pending" : q.isError && !q.data ? "error" : "ready";
  useControlRoomPalette(riskiest?.agent_id ?? null);

  // Playback stops when the page goes away.
  useEffect(() => () => useControlRoomStore.getState().setPlaying(false), []);

  const counts = levelCounts(shown);
  const summary = localizeDigits(
    t("controlRoom.map.summary", { total: shown.length, red: counts.red, amber: counts.amber, green: counts.green, hours: dataHour }),
    digits,
  );
  const retry = () => void q.refetch();
  const refresh = () => {
    void q.refetch();
    for (const queryKey of [qk.system.freshness, qk.swaps.all, qk.anomalies.all]) void client.invalidateQueries({ queryKey });
  };

  const scrubber = (
    <TimeScrubber hour={hour} onChange={setHour} playing={playing} onPlayingChange={setPlaying} asOf={q.data?.as_of} busy={q.isFetching} />
  );
  const list = (
    <>
      <FilterPanel all={all} shown={shown.length} />
      <AgentList agents={shown} status={status} onRetry={retry} retrying={q.isFetching} className={desktop ? "flex-1" : "h-[60vh]"} />
    </>
  );
  const inspector = (
    <Inspector agent={selected} all={all} swaps={q.data?.swaps ?? []} hour={dataHour} riskiest={riskiest} onBack={desktop ? undefined : () => select(null)} />
  );

  return (
    <div className="space-y-4" data-testid="control-room" data-hour={dataHour}>
      <h1 className="sr-only">{t("page.controlRoom")}</h1>
      <KpiRow agents={all} mapQuery={q} hour={dataHour} />

      {desktop ? (
        <div className="grid h-[calc(100dvh-18rem)] min-h-[560px] grid-cols-[minmax(260px,300px)_minmax(0,1fr)_minmax(300px,360px)] gap-4">
          <aside aria-label={t("controlRoom.list.title")} className={`${PANE} flex flex-col gap-3`}>
            {list}
          </aside>
          <MapPane agents={shown} swaps={swaps} status={status} onRetry={retry} retrying={q.isFetching} summary={summary} scrubber={scrubber} helpPoints={helpPoints} />
          <aside aria-label={t("controlRoom.inspector.title")} className={`${PANE} overflow-y-auto`}>
            {inspector}
          </aside>
        </div>
      ) : (
        <div className="space-y-3">
          {scrubber}
          {selected ? inspector : <div className={`${PANE} space-y-3`}>{list}</div>}
        </div>
      )}

      <FreshnessStripe updatedAt={q.dataUpdatedAt} fetching={q.isFetching} onRefresh={refresh} />
    </div>
  );
}
