import "maplibre-gl/dist/maplibre-gl.css";

import {
  Map as MlMap,
  NavigationControl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
  type MapSourceDataEvent,
  type Marker,
} from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

import type { MapAgent, MapSwap } from "../../../api/types";
import { formatMoney, formatNumber } from "../../../lib/format";
import { useLoopActive, useReducedMotionPref } from "../../../lib/motionPrefs";
import { useLocale } from "../../../lib/prefs";
import { MS } from "../../../styles/motion";
import { clearMarkers, syncClusterLabels, syncSwapChips } from "./mapMarkers";
import { agentFeatures, BD_BOUNDS, swapLines } from "./mapModel";
import { BOUNDARY_URL, LAND_OPACITY, LAYER, mapStyle, SRC } from "./mapStyle";
import { useMapMotion } from "./useMapMotion";

export interface RiskMapProps {
  agents: MapAgent[];
  swaps: MapSwap[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onlineTiles: boolean;
  /** WebGL or style start-up failed; the page falls back to the list. */
  onFail: () => void;
  /** Text summary for screen readers. */
  label: string;
}

const CLICKABLE = [LAYER.dot, LAYER.glow, LAYER.cluster] as const;

/** MapLibre risk map: clustered glowing dots, selected ripple, SwapFlow droplets. Loaded lazily. */
export default function RiskMap({ agents, swaps, selectedId, onSelect, onlineTiles, onFail, label }: RiskMapProps) {
  const { lang, digits } = useLocale();
  const reduced = useReducedMotionPref();
  const ref = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MlMap | null>(null);
  const clusters = useRef(new Map<number, Marker>());
  const chips = useRef(new Map<number, Marker>());
  const active = useLoopActive(ref);
  const start = useRef({ online: onlineTiles, onSelect, onFail });

  useEffect(() => {
    start.current.onSelect = onSelect;
    start.current.onFail = onFail;
  }, [onSelect, onFail]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handlers = start.current;
    let m: MlMap;
    try {
      m = new MlMap({
        container: el,
        style: mapStyle(new URL(BOUNDARY_URL, window.location.origin).href, handlers.online),
        bounds: BD_BOUNDS,
        fitBoundsOptions: { padding: 16 },
        maxBounds: [
          [84, 18],
          [96.5, 29],
        ],
        minZoom: 5,
        maxZoom: 13,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        attributionControl: { compact: true },
      });
    } catch {
      handlers.onFail();
      return;
    }
    m.touchZoomRotate.disableRotation();
    m.addControl(new NavigationControl({ showCompass: false }), "top-right");
    // A listener keeps maplibre from logging; offline tile misses are expected when tiles are on.
    m.on("error", () => undefined);
    m.on("load", () => setMap(m));

    const pick = (e: MapLayerMouseEvent) => {
      const id = e.features?.[0]?.properties?.["id"];
      if (id !== undefined) handlers.onSelect(Number(id));
    };
    m.on("click", LAYER.dot, pick);
    m.on("click", LAYER.glow, pick);
    m.on("click", LAYER.cluster, (e) => {
      const f = e.features?.[0];
      if (!f || f.geometry.type !== "Point") return;
      const [lng = 0, lat = 0] = f.geometry.coordinates;
      void m
        .getSource<GeoJSONSource>(SRC.agents)
        ?.getClusterExpansionZoom(Number(f.properties?.["cluster_id"]))
        .then((zoom) => m.easeTo({ center: [lng, lat], zoom }));
    });
    for (const layer of CLICKABLE) {
      m.on("mouseenter", layer, () => (m.getCanvas().style.cursor = "pointer"));
      m.on("mouseleave", layer, () => (m.getCanvas().style.cursor = ""));
    }

    const resize = new ResizeObserver(() => m.resize());
    resize.observe(el);
    const labels = clusters.current;
    const chipMap = chips.current;
    return () => {
      resize.disconnect();
      clearMarkers(labels);
      clearMarkers(chipMap);
      m.remove();
    };
  }, []);

  useEffect(() => {
    map?.getSource<GeoJSONSource>(SRC.agents)?.setData(agentFeatures(agents, selectedId));
  }, [map, agents, selectedId]);

  useEffect(() => {
    if (!map) return;
    const labels = clusters.current;
    const sync = () => syncClusterLabels(map, labels, (n) => formatNumber(n, digits));
    const onData = (e: MapSourceDataEvent) => {
      if (e.sourceId === SRC.agents && e.isSourceLoaded) sync();
    };
    sync();
    map.on("sourcedata", onData);
    map.on("moveend", sync);
    return () => {
      map.off("sourcedata", onData);
      map.off("moveend", sync);
    };
  }, [map, digits]);

  useEffect(() => {
    if (!map) return;
    map.getSource<GeoJSONSource>(SRC.swaps)?.setData(swapLines(swaps));
    syncSwapChips(map, chips.current, swaps, (s) => formatMoney(s.amount_bdt, digits, { compact: true, lang }));
  }, [map, swaps, digits, lang]);

  useMapMotion(map, swaps, chips, active);

  useEffect(() => {
    if (!map) return;
    map.setLayoutProperty(LAYER.tiles, "visibility", onlineTiles ? "visible" : "none");
    map.setPaintProperty(LAYER.land, "fill-opacity", onlineTiles ? LAND_OPACITY.online : LAND_OPACITY.offline);
  }, [map, onlineTiles]);

  const focus = agents.find((a) => a.agent_id === selectedId);
  const lng = focus?.lng;
  const lat = focus?.lat;
  useEffect(() => {
    if (!map || lng === undefined || lat === undefined) return;
    if (map.getZoom() >= 7 && map.getBounds().contains([lng, lat])) return;
    map.easeTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 8), duration: reduced ? 0 : MS.reveal });
  }, [map, lng, lat, reduced]);

  return (
    <div
      ref={ref}
      role="region"
      aria-label={label}
      data-testid="risk-map"
      data-ready={map ? "true" : "false"}
      className="absolute inset-0 overflow-hidden rounded-[var(--radius-card)] bg-[#0A0F1F]"
    />
  );
}
