// Offline-first dark style: the bundled Natural Earth boundary on a solid background.
// Online raster tiles exist only as a hidden layer the user can switch on. No glyphs or sprites,
// so nothing is fetched from the internet unless that toggle is on.
import type { FeatureCollection } from "geojson";
import type { ExpressionSpecification, StyleSpecification } from "maplibre-gl";

import { DROPLET_HEX, FLOW_HEX, RISK_HEX } from "./mapModel";

export const SRC = { agents: "agents", swaps: "swaps", droplets: "droplets" } as const;
export const LAYER = {
  tiles: "online-tiles",
  land: "bd-land",
  clusterGlow: "cluster-glow",
  cluster: "cluster-core",
  glow: "agent-glow",
  ripple: "agent-ripple",
  dot: "agent-dot",
} as const;

export const BOUNDARY_URL = "/geo/bangladesh.geojson";
const TILES = ["a", "b", "c"].map((s) => `https://${s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png`);
const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

export const LAND_OPACITY = { offline: 1, online: 0.35 } as const;

/** Colour by the worst level inside a cluster (maxSev: 0 safe, 1 watch, 2 act). */
const CLUSTER_COLOR: ExpressionSpecification = ["match", ["get", "maxSev"], 2, RISK_HEX.red, 1, RISK_HEX.amber, RISK_HEX.green];

export function mapStyle(boundaryUrl: string, online: boolean): StyleSpecification {
  return {
    version: 8,
    sources: {
      tiles: {
        type: "raster",
        tiles: TILES,
        tileSize: 256,
        maxzoom: 18,
        attribution: "© OpenStreetMap contributors © CARTO",
      },
      boundary: { type: "geojson", data: boundaryUrl, attribution: "Natural Earth (public domain)" },
      [SRC.agents]: {
        type: "geojson",
        data: EMPTY,
        cluster: true,
        clusterRadius: 42,
        clusterMaxZoom: 9,
        clusterProperties: { maxSev: ["max", ["get", "sev"]] },
      },
      [SRC.swaps]: { type: "geojson", data: EMPTY },
      [SRC.droplets]: { type: "geojson", data: EMPTY },
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#0A0F1F" } },
      {
        id: LAYER.tiles,
        type: "raster",
        source: "tiles",
        layout: { visibility: online ? "visible" : "none" },
        paint: { "raster-opacity": 0.75 },
      },
      {
        id: LAYER.land,
        type: "fill",
        source: "boundary",
        paint: { "fill-color": "#121A33", "fill-opacity": online ? LAND_OPACITY.online : LAND_OPACITY.offline },
      },
      { id: "bd-divisions", type: "line", source: "boundary", paint: { "line-color": "rgba(124,148,255,0.28)", "line-width": 0.8 } },
      {
        id: "swap-lines",
        type: "line",
        source: SRC.swaps,
        layout: { "line-cap": "round" },
        paint: {
          "line-color": FLOW_HEX,
          "line-width": ["case", ["get", "relevant"], 2.5, 1.5],
          "line-opacity": ["case", ["get", "relevant"], 0.85, 0.3],
          "line-dasharray": [2, 2],
        },
      },
      {
        id: LAYER.clusterGlow,
        type: "circle",
        source: SRC.agents,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": CLUSTER_COLOR,
          "circle-radius": ["step", ["get", "point_count"], 22, 10, 28, 50, 34],
          "circle-blur": 0.9,
          "circle-opacity": 0.45,
        },
      },
      {
        id: LAYER.cluster,
        type: "circle",
        source: SRC.agents,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": CLUSTER_COLOR,
          "circle-radius": ["step", ["get", "point_count"], 14, 10, 18, 50, 22],
          "circle-opacity": 0.92,
          "circle-stroke-color": "rgba(255,255,255,0.35)",
          "circle-stroke-width": 1,
        },
      },
      {
        id: LAYER.glow,
        type: "circle",
        source: SRC.agents,
        filter: ["!", ["has", "point_count"]],
        paint: { "circle-color": ["get", "color"], "circle-radius": 13, "circle-blur": 1, "circle-opacity": 0.5 },
      },
      {
        id: LAYER.ripple,
        type: "circle",
        source: SRC.agents,
        filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "selected"], true]],
        paint: {
          "circle-radius": 14,
          "circle-opacity": 0,
          "circle-stroke-color": "#FFFFFF",
          "circle-stroke-width": 2,
          "circle-stroke-opacity": 0.8,
        },
      },
      {
        id: LAYER.dot,
        type: "circle",
        source: SRC.agents,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": ["case", ["get", "selected"], 7.5, 5.5],
          "circle-stroke-color": "rgba(255,255,255,0.75)",
          "circle-stroke-width": 1,
        },
      },
      {
        id: "droplets",
        type: "circle",
        source: SRC.droplets,
        paint: {
          "circle-color": DROPLET_HEX,
          "circle-radius": 3.5,
          "circle-blur": 0.2,
          "circle-stroke-color": "rgba(255,255,255,0.6)",
          "circle-stroke-width": 1,
        },
      },
    ],
  };
}
