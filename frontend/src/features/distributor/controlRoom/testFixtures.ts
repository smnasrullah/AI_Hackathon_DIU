// Typed GET /map/agents payloads for control room tests. Levels change with the scrubbed hour.
import type { FloatType, MapAgent, MapAgents, MapSwap, RiskLevel } from "../../../api/types";

export const AS_OF = "2026-03-10T06:00:00Z";

function agent(id: number, name: string, district: string, level: RiskLevel, probability: number, worst: FloatType = "cash"): MapAgent {
  return {
    agent_id: id,
    code: `AGT-000${id}`,
    name,
    district,
    upazila: null,
    lat: 23.7 + id / 100,
    lng: 90.35 + id / 100,
    level,
    probability,
    worst_float: worst,
  };
}

export const SWAP: MapSwap = {
  id: 9,
  donor_agent_id: 3,
  receiver_agent_id: 1,
  from_lat: 23.73,
  from_lng: 90.38,
  to_lat: 23.71,
  to_lng: 90.36,
  float_type: "cash",
  amount_bdt: 15_000,
  status: "pending",
  van_trip_saved: true,
  relevant: true,
};

/** Hour 0: one Watch, two Safe. From +24h: two Act now, one Watch. */
export function mapAt(hour: number): MapAgents {
  const later = hour >= 24;
  return {
    at_hour: hour,
    as_of: AS_OF,
    ts: new Date(new Date(AS_OF).getTime() + hour * 3_600_000).toISOString(),
    agents: [
      agent(1, "Mirpur 10 Mobile Point", "Dhaka", later ? "red" : "green", later ? 0.81 : 0.05),
      agent(2, "Savar Bazar Store", "Dhaka", later ? "red" : "amber", later ? 0.7 : 0.3, "emoney"),
      agent(3, "Tongi Station Agent", "Gazipur", later ? "amber" : "green", later ? 0.35 : 0.02),
    ],
    swaps: [SWAP],
    model_version: "lgbm-q-2026.03",
    generated_at: "2026-03-10T06:01:00Z",
  };
}
