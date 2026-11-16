import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import type { ApiClient } from "../client";
import { unwrap } from "../errors";
import type { components } from "../generated/schema";

export type StudentStats = components["schemas"]["StudentStatsView"];
export type PublicSettings = components["schemas"]["PublicSettingsView"];
export type NotificationItem = components["schemas"]["NotificationItemView"];
export type Leaderboard = components["schemas"]["LeaderboardView"];
export type StudentAssignmentItem = components["schemas"]["AssignmentStudentListItemView"];

export const studentKeys = {
  stats: ["me", "stats"] as const,
  settings: ["settings", "public"] as const,
  unread: ["notifications", "unread"] as const,
  notifications: (unreadOnly: boolean, page: number) => ["notifications", "list", unreadOnly, page] as const,
  leaderboard: (period: "weekly" | "monthly", offset: number) => ["leaderboard", period, offset] as const,
  openAssignments: ["assignments", "open"] as const,
};

export function meStatsQuery(client: ApiClient) {
  return queryOptions({
    queryKey: studentKeys.stats,
    queryFn: () => unwrap(client.GET("/api/me/stats")),
    staleTime: 60_000,
  });
}

export function publicSettingsQuery(client: ApiClient) {
  return queryOptions({
    queryKey: studentKeys.settings,
    queryFn: () => unwrap(client.GET("/api/settings/public")),
    staleTime: 10 * 60_000,
  });
}

export function unreadCountQuery(client: ApiClient, enabled = true) {
  return queryOptions({
    queryKey: studentKeys.unread,
    queryFn: () => unwrap(client.GET("/api/notifications/unread-count")),
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}

export function notificationsQuery(client: ApiClient, unreadOnly: boolean, page: number) {
  return queryOptions({
    queryKey: studentKeys.notifications(unreadOnly, page),
    queryFn: () =>
      unwrap(client.GET("/api/notifications", { params: { query: { unreadOnly, page, pageSize: 20 } } })),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

export function leaderboardQuery(client: ApiClient, period: "weekly" | "monthly", offset: number) {
  return queryOptions({
    queryKey: studentKeys.leaderboard(period, offset),
    queryFn: () => unwrap(client.GET("/api/leaderboard", { params: { query: { period, offset, top: 50 } } })),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

export function openAssignmentsQuery(client: ApiClient) {
  return queryOptions({
    queryKey: studentKeys.openAssignments,
    queryFn: () => unwrap(client.GET("/api/assignments", { params: { query: { state: "open", pageSize: 6 } } })),
    staleTime: 60_000,
  });
}

export const notificationMutations = {
  read: (client: ApiClient, id: number) =>
    unwrap(client.POST("/api/notifications/{id}/read", { params: { path: { id } } })),
  readAll: (client: ApiClient) => unwrap(client.POST("/api/notifications/read-all")),
};
