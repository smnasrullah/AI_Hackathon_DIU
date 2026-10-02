import type { PeerFeature } from "../../../api/types";

export interface PeerScale {
  /** Positions in percent of the track. */
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  value: number;
  /** The agent sits outside the peers' 10th-90th percentile band. */
  outside: boolean;
}

/** Place one feature's peer box and the agent's value on a shared 0-100 track (10% padding). */
export function peerScale(f: PeerFeature): PeerScale {
  const lo = Math.min(f.p10, f.value);
  const hi = Math.max(f.p90, f.value);
  const pad = (hi - lo || 1) * 0.1;
  const min = lo - pad;
  const span = hi + pad - min;
  const at = (v: number) => ((v - min) / span) * 100;
  return { p10: at(f.p10), p25: at(f.p25), p50: at(f.p50), p75: at(f.p75), p90: at(f.p90), value: at(f.value), outside: f.value < f.p10 || f.value > f.p90 };
}
