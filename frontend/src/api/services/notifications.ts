import { api } from "../../lib/api";
import type { NotificationItem, NotificationListQuery, NotificationPage, Ok } from "../types";

export async function listNotifications(params: NotificationListQuery = {}): Promise<NotificationPage> {
  return (await api.get<NotificationPage>("/notifications", { params })).data;
}

export async function markNotificationRead(id: number): Promise<NotificationItem> {
  return (await api.post<NotificationItem>(`/notifications/${id}/read`)).data;
}

export async function markAllNotificationsRead(): Promise<Ok<"read_all_api_v1_notifications_read_all_post">> {
  return (await api.post<Ok<"read_all_api_v1_notifications_read_all_post">>("/notifications/read-all")).data;
}
