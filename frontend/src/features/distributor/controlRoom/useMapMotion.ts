import type { ExpressionSpecification, GeoJSONSource, Map as MlMap, Marker } from "maplibre-gl";
import { useEffect, type RefObject } from "react";

import type { MapSwap } from "../../../api/types";
import { MAP_FRAME_MS, MAP_LOOP_MS } from "../../../styles/motion";
import { along, droplets } from "./mapModel";
import { LAYER, SRC } from "./mapStyle";

/** 0 -> 1 -> 0 over `period` ms. */
function wave(now: number, period: number): number {
  return (1 - Math.cos((2 * Math.PI * (now % period)) / period)) / 2;
}

function byLevel(red: number, amber: number, green: number): ExpressionSpecification {
  return ["match", ["get", "level"], "red", red, "amber", amber, green];
}

/**
 * Breathing glow (faster for Act now), selected-agent ripple and SwapFlow droplets with their
 * amount chips. When `active` is false (reduced motion, hidden tab, off screen) everything is still.
 */
export function useMapMotion(map: MlMap | null, swaps: readonly MapSwap[], chips: RefObject<Map<number, Marker>>, active: boolean): void {
  useEffect(() => {
    if (!map) return;
    const drops = map.getSource<GeoJSONSource>(SRC.droplets);
    const chipMap = chips.current;
    const place = (phase: number) => {
      drops?.setData(droplets(swaps, phase));
      for (const s of swaps) chipMap?.get(s.id)?.setLngLat(along(s, phase));
    };

    if (!active) {
      map.setPaintProperty(LAYER.glow, "circle-radius", byLevel(16, 13, 11));
      map.setPaintProperty(LAYER.glow, "circle-opacity", byLevel(0.55, 0.45, 0.3));
      map.setPaintProperty(LAYER.ripple, "circle-radius", 14);
      map.setPaintProperty(LAYER.ripple, "circle-stroke-opacity", 0.8);
      place(0.5);
      return;
    }

    let raf = 0;
    let last = Number.NEGATIVE_INFINITY;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < MAP_FRAME_MS) return;
      last = now;
      const r = wave(now, MAP_LOOP_MS.breatheRed);
      const a = wave(now, MAP_LOOP_MS.breatheAmber);
      const g = wave(now, MAP_LOOP_MS.breatheGreen);
      map.setPaintProperty(LAYER.glow, "circle-radius", byLevel(12 + 9 * r, 11 + 5 * a, 10 + 3 * g));
      map.setPaintProperty(LAYER.glow, "circle-opacity", byLevel(0.3 + 0.45 * r, 0.25 + 0.3 * a, 0.2 + 0.2 * g));
      // Two rings per loop: the ring grows and fades every half period.
      const ring = ((now % MAP_LOOP_MS.ripple) / MAP_LOOP_MS.ripple * 2) % 1;
      map.setPaintProperty(LAYER.ripple, "circle-radius", 9 + 18 * ring);
      map.setPaintProperty(LAYER.ripple, "circle-stroke-opacity", 0.9 * (1 - ring));
      place((now % MAP_LOOP_MS.flow) / MAP_LOOP_MS.flow);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [map, swaps, chips, active]);
}
