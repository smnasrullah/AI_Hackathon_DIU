import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { qk } from "../keys";
import { createEvent, deleteEvent, listEvents, updateEvent } from "../services/events";
import type { EventIn, EventListQuery } from "../types";

export function useEvents(q: EventListQuery, enabled = true) {
  return useQuery({ queryKey: qk.events(q), queryFn: () => listEvents(q), enabled, staleTime: 5 * 60_000 });
}

/** Create (id null) or replace an event; every events query refetches afterwards. */
export function useSaveEvent() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number | null; body: EventIn }) => (id === null ? createEvent(body) : updateEvent(id, body)),
    onSettled: () => client.invalidateQueries({ queryKey: qk.eventsAll }),
  });
}

export function useDeleteEvent() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteEvent(id),
    onSettled: () => client.invalidateQueries({ queryKey: qk.eventsAll }),
  });
}
