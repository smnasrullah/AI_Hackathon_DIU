// HTML labels drawn over the map: cluster counts and the amount chips that travel with droplets.
// DOM markers instead of symbol layers keep the style glyph-free, so the map works fully offline.
import { Marker, type Map as MlMap } from "maplibre-gl";

import type { MapSwap } from "../../../api/types";
import { SRC } from "./mapStyle";

const CLUSTER_CLASS = "pointer-events-none num text-xs font-bold text-white";
const CHIP_CLASS =
  "pointer-events-none num rounded-full border border-white/20 bg-[#121A33]/90 px-2 py-0.5 text-[11px] font-semibold text-white shadow-[0_0_16px_rgba(0,184,217,.35)]";

function label(className: string, text: string): HTMLElement {
  const el = document.createElement("div");
  el.className = className;
  el.setAttribute("aria-hidden", "true");
  el.textContent = text;
  return el;
}

/** Keep one count label per visible cluster; drop labels for clusters that went away. */
export function syncClusterLabels(map: MlMap, labels: Map<number, Marker>, format: (n: number) => string): void {
  const seen = new Set<number>();
  for (const f of map.querySourceFeatures(SRC.agents, { filter: ["has", "point_count"] })) {
    const id = Number(f.properties?.["cluster_id"]);
    if (seen.has(id) || f.geometry.type !== "Point") continue;
    seen.add(id);
    const [lng = 0, lat = 0] = f.geometry.coordinates;
    const text = format(Number(f.properties?.["point_count"]));
    const existing = labels.get(id);
    if (existing) {
      existing.setLngLat([lng, lat]);
      existing.getElement().textContent = text;
    } else {
      labels.set(id, new Marker({ element: label(CLUSTER_CLASS, text) }).setLngLat([lng, lat]).addTo(map));
    }
  }
  for (const [id, marker] of labels) {
    if (!seen.has(id)) {
      marker.remove();
      labels.delete(id);
    }
  }
}

/** One amount chip per relevant swap ("৳১৫,০০০"); positions are set by the flow loop. */
export function syncSwapChips(map: MlMap, chips: Map<number, Marker>, swaps: readonly MapSwap[], format: (s: MapSwap) => string): void {
  const keep = new Set<number>();
  for (const s of swaps) {
    if (!s.relevant) continue;
    keep.add(s.id);
    const text = format(s);
    const existing = chips.get(s.id);
    if (existing) existing.getElement().textContent = text;
    else chips.set(s.id, new Marker({ element: label(CHIP_CLASS, text), offset: [0, -14] }).setLngLat([s.from_lng, s.from_lat]).addTo(map));
  }
  for (const [id, marker] of chips) {
    if (!keep.has(id)) {
      marker.remove();
      chips.delete(id);
    }
  }
}

export function clearMarkers(markers: Map<number, Marker>): void {
  for (const m of markers.values()) m.remove();
  markers.clear();
}
