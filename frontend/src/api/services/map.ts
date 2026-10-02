import { api } from "../../lib/api";
import type { MapAgents } from "../types";

/** Scoped agents' risk at `atHour` (0..72) plus current swap suggestions (time scrubber). */
export async function getMapAgents(atHour: number): Promise<MapAgents> {
  return (await api.get<MapAgents>("/map/agents", { params: { at_hour: atHour } })).data;
}
