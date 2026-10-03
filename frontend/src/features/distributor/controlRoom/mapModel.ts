// Pure GeoJSON shaping for the risk map (no maplibre import, so it is testable in jsdom).
import type { Feature, FeatureCollection, LineString, Point } from "geojson";

import type { MapAgent, MapSwap, RiskLevel } from "../../../api/types";
import { SEVERITY } from "./controlRoomModel";

/** Bangladesh, with a little sea margin (lng/lat). */
export const BD_BOUNDS: [[number, number], [number, number]] = [
  [87.6, 20.4],
  [93.0, 26.9],
];

export interface AgentProps {
  id: number;
  level: RiskLevel;
  sev: number;
  selected: boolean;
}

export interface SwapProps {
  id: number;
  relevant: boolean;
}

export function agentFeatures(agents: readonly MapAgent[], selectedId: number | null): FeatureCollection<Point, AgentProps> {
  return {
    type: "FeatureCollection",
    features: agents.map((a) => ({
      type: "Feature",
      id: a.agent_id,
      geometry: { type: "Point", coordinates: [a.lng, a.lat] },
      properties: { id: a.agent_id, level: a.level, sev: SEVERITY[a.level], selected: a.agent_id === selectedId },
    })),
  };
}

export function swapLines(swaps: readonly MapSwap[]): FeatureCollection<LineString, SwapProps> {
  return {
    type: "FeatureCollection",
    features: swaps.map((s) => ({
      type: "Feature",
      id: s.id,
      geometry: { type: "LineString", coordinates: [[s.from_lng, s.from_lat], [s.to_lng, s.to_lat]] },
      properties: { id: s.id, relevant: s.relevant },
    })),
  };
}

/** Point `t` (0..1) of the way from donor to receiver. */
export function along(s: MapSwap, t: number): [number, number] {
  return [s.from_lng + (s.to_lng - s.from_lng) * t, s.from_lat + (s.to_lat - s.from_lat) * t];
}

/** Droplets spaced evenly along each relevant swap, shifted by `phase` (0..1) so they flow donor -> receiver. */
export function droplets(swaps: readonly MapSwap[], phase: number, perLine = 3): FeatureCollection<Point> {
  const features: Feature<Point>[] = [];
  for (const s of swaps) {
    if (!s.relevant) continue;
    for (let i = 0; i < perLine; i++) {
      features.push({ type: "Feature", geometry: { type: "Point", coordinates: along(s, (phase + i / perLine) % 1) }, properties: {} });
    }
  }
  return { type: "FeatureCollection", features };
}
