import { api } from "../../lib/api";
import type { EventListQuery, EventPage } from "../types";

export async function listEvents(params: EventListQuery = {}): Promise<EventPage> {
  return (await api.get<EventPage>("/events", { params })).data;
}
