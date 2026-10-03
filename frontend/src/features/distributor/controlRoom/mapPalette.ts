// Map colours come from the design tokens (tokens.css). WebGL paint cannot read CSS variables,
// so they are resolved once per theme with getComputedStyle and handed to the style as strings.
import type { RiskLevel } from "../../../api/types";

export interface MapPalette {
  water: string;
  land: string;
  border: string;
  halo: string;
  outline: string;
  selected: string;
  flow: string;
  droplet: string;
  risk: Record<RiskLevel, string>;
  dark: boolean;
}

const TOKENS = {
  water: "--map-water",
  land: "--map-land",
  border: "--map-border",
  halo: "--map-halo",
  outline: "--map-outline",
  selected: "--map-selected",
  flow: "--map-flow",
  droplet: "--map-droplet",
} as const;

const RISK_TOKENS: Record<RiskLevel, string> = { green: "--risk-safe", amber: "--risk-watch", red: "--risk-act" };

/** Last resort when a token is missing (jsdom, or a stylesheet that failed to load): neutral grey, never invisible. */
const MISSING = "rgb(128, 128, 128)";

export function readMapPalette(root: HTMLElement = document.documentElement): MapPalette {
  const css = getComputedStyle(root);
  const read = (name: string) => css.getPropertyValue(name).trim() || MISSING;
  const base = Object.fromEntries(Object.entries(TOKENS).map(([k, v]) => [k, read(v)])) as Record<keyof typeof TOKENS, string>;
  return {
    ...base,
    risk: { green: read(RISK_TOKENS.green), amber: read(RISK_TOKENS.amber), red: read(RISK_TOKENS.red) },
    dark: root.dataset.theme === "dark",
  };
}
