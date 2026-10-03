import { api } from "../../lib/api";
import type { EventIn, EventItem, EventListQuery, EventPage } from "../types";

export async function listEvents(params: EventListQuery = {}): Promise<EventPage> {
  return (await api.get<EventPage>("/events", { params })).data;
}

export async function createEvent(body: EventIn): Promise<EventItem> {
  return (await api.post<EventItem>("/events", body)).data;
}

export async function updateEvent(id: number, body: EventIn): Promise<EventItem> {
  return (await api.put<EventItem>(`/events/${id}`, body)).data;
}

export async function deleteEvent(id: number): Promise<void> {
  await api.delete(`/events/${id}`);
}
