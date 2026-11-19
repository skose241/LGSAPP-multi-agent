import { queryOptions } from "@tanstack/react-query";
import type { ApiClient } from "../client";
import { unwrap } from "../errors";
import type { components } from "../generated/schema";

export type AdminUser = components["schemas"]["AdminUserDto"];
export type PasswordResetRequest = components["schemas"]["PasswordResetRequestDto"];
export type CreateUserBody = components["schemas"]["CreateUserRequest"];
export type CreatedUser = components["schemas"]["CreatedUserResponse"];
export type UpdateUserBody = components["schemas"]["UpdateUserProfileRequest"];
export type BulkUserItem = components["schemas"]["BulkUserItemRequest"];
export type BulkCreatedUsers = components["schemas"]["BulkCreatedUsersResponse"];
export type OneTimePassword = components["schemas"]["OneTimePasswordResponse"];
export type GenerationSchedule = components["schemas"]["GenerationScheduleView"];
export type ScheduleItem = components["schemas"]["ScheduleItemRequest"];

export const adminKeys = {
  all: ["admin"] as const,
  users: () => [...adminKeys.all, "users"] as const,
  usersByRole: (role: string | undefined, reported?: boolean) =>
    [...adminKeys.users(), "list", role ?? "all", reported ? "reported" : "any"] as const,
  user: (id: number) => [...adminKeys.users(), "detail", id] as const,
  resetRequests: () => [...adminKeys.all, "password-reset-requests"] as const,
  generationSchedule: () => [...adminKeys.all, "generation-schedule"] as const,
};

export function adminUsersQuery(client: ApiClient, role?: string, reported?: boolean) {
  return queryOptions({
    queryKey: adminKeys.usersByRole(role, reported),
    queryFn: () =>
      unwrap(
        client.GET("/api/admin/users", {
          params: { query: { ...(role ? { role } : {}), ...(reported ? { reported: true } : {}) } },
        }),
      ),
    staleTime: 15_000,
  });
}

export function adminUserQuery(client: ApiClient, id: number) {
  return queryOptions({
    queryKey: adminKeys.user(id),
    queryFn: () => unwrap(client.GET("/api/admin/users/{id}", { params: { path: { id } } })),
    staleTime: 15_000,
  });
}

export function passwordResetRequestsQuery(client: ApiClient) {
  return queryOptions({
    queryKey: adminKeys.resetRequests(),
    queryFn: () => unwrap(client.GET("/api/admin/password-reset-requests")),
    staleTime: 15_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}

export function generationScheduleQuery(client: ApiClient) {
  return queryOptions({
    queryKey: adminKeys.generationSchedule(),
    queryFn: () => unwrap(client.GET("/api/admin/generation-schedule")),
    staleTime: 15_000,
  });
}

export const adminMutations = {
  replaceGenerationSchedule: (client: ApiClient, items: ScheduleItem[]) =>
    unwrap(client.PUT("/api/admin/generation-schedule", { body: { items } })),
  createUser: (client: ApiClient, body: CreateUserBody) => unwrap(client.POST("/api/admin/users", { body })),
  updateUser: (client: ApiClient, id: number, body: UpdateUserBody) =>
    unwrap(client.PUT("/api/admin/users/{id}", { params: { path: { id } }, body })),
  bulkCreateUsers: (client: ApiClient, items: BulkUserItem[]) =>
    unwrap(client.POST("/api/admin/users/bulk", { body: { items } })),
  ban: (client: ApiClient, id: number) =>
    unwrap(client.POST("/api/admin/users/{id}/ban", { params: { path: { id } } })),
  unban: (client: ApiClient, id: number) =>
    unwrap(client.POST("/api/admin/users/{id}/unban", { params: { path: { id } } })),
  regeneratePassword: (client: ApiClient, id: number) =>
    unwrap(client.POST("/api/admin/users/{id}/regenerate-password", { params: { path: { id } } })),
  setBranchLesson: (client: ApiClient, id: number, branchLessonId: number | null) =>
    unwrap(
      client.PUT("/api/admin/users/{id}/branch-lesson", {
        params: { path: { id } },
        body: { branchLessonId },
      }),
    ),
  completeResetRequest: (client: ApiClient, id: number) =>
    unwrap(client.POST("/api/admin/password-reset-requests/{id}/complete", { params: { path: { id } } })),
  rejectResetRequest: (client: ApiClient, id: number) =>
    unwrap(client.POST("/api/admin/password-reset-requests/{id}/reject", { params: { path: { id } } })),
};
