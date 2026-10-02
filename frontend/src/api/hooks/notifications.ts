import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { qk } from "../keys";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "../services/notifications";
import type { NotificationListQuery } from "../types";

const POLL_MS = 60_000;

export function useNotifications(q: NotificationListQuery = {}) {
  return useQuery({ queryKey: qk.notifications.list(q), queryFn: () => listNotifications(q), refetchInterval: POLL_MS });
}

export function useMarkNotificationRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => markNotificationRead(id),
    onSettled: () => client.invalidateQueries({ queryKey: qk.notifications.all }),
  });
}

export function useMarkAllNotificationsRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: markAllNotificationsRead,
    onSettled: () => client.invalidateQueries({ queryKey: qk.notifications.all }),
  });
}
