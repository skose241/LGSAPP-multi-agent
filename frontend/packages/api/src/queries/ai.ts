import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import type { ApiClient } from "../client";
import { unwrap } from "../errors";
import type { components } from "../generated/schema";

export type AiQuota = components["schemas"]["AiQuotaStatusView"];
export type AiSolutionResponse = components["schemas"]["AiSolutionResponse"];
export type AiAdminStatus = components["schemas"]["AiAdminStatusView"];
export type AiGateStatus = components["schemas"]["AiGateStatusView"];
export type AiUsage = components["schemas"]["AiUsageView"];
export type AiUsageDayRow = components["schemas"]["AiUsageDayRow"];
export type AiUsageTotals = components["schemas"]["AiUsageTotals"];
export type AiUsageUserRow = components["schemas"]["AiUsageUserRow"];
export type AdminSetting = components["schemas"]["AdminSettingView"];
export type AdminSettingsResult = components["schemas"]["AdminSettingsUpdateResult"];
export type DisputedQuestionList = components["schemas"]["DisputedQuestionListView"];
export type DisputedQuestionItem = components["schemas"]["DisputedQuestionItemView"];
export type AnswerKeyChange = components["schemas"]["AnswerKeyChangeView"];
export type DismissDispute = components["schemas"]["DismissDisputeView"];

export interface DisputedParams {
  lessonId?: number;
  page: number;
  pageSize: number;
}

export const aiKeys = {
  quota: ["ai", "quota"] as const,
  status: ["ai", "admin-status"] as const,
  usage: (from: string | undefined, to: string | undefined) => ["ai", "admin-usage", from ?? "", to ?? ""] as const,
  settings: ["ai", "admin-settings"] as const,
  disputed: (params: DisputedParams) => ["ai", "disputed", params] as const,
  disputedAll: ["ai", "disputed"] as const,
};

export function aiQuotaQuery(client: ApiClient, enabled = true) {
  return queryOptions({
    queryKey: aiKeys.quota,
    queryFn: () => unwrap(client.GET("/api/ai/quota")),
    staleTime: 30_000,
    enabled,
  });
}

export function aiAdminStatusQuery(client: ApiClient) {
  return queryOptions({
    queryKey: aiKeys.status,
    queryFn: () => unwrap(client.GET("/api/admin/ai/status")),
    staleTime: 15_000,
  });
}

export function aiAdminUsageQuery(client: ApiClient, from?: string, to?: string) {
  return queryOptions({
    queryKey: aiKeys.usage(from, to),
    queryFn: () => unwrap(client.GET("/api/admin/ai/usage", { params: { query: { from, to } } })),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
}

export function adminSettingsQuery(client: ApiClient) {
  return queryOptions({
    queryKey: aiKeys.settings,
    queryFn: () => unwrap(client.GET("/api/admin/settings")),
    staleTime: 0,
  });
}

export function disputedQuestionsQuery(client: ApiClient, params: DisputedParams) {
  return queryOptions({
    queryKey: aiKeys.disputed(params),
    queryFn: () =>
      unwrap(
        client.GET("/api/admin/disputed-questions", {
          params: { query: { lessonId: params.lessonId, page: params.page, pageSize: params.pageSize } },
        }),
      ),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
}

export const aiMutations = {
  requestSolution: (client: ApiClient, questionId: number) =>
    unwrap(client.POST("/api/questions/{id}/solutions/ai", { params: { path: { id: questionId } } })),
  updateSettings: (client: ApiClient, changes: Record<string, number>) =>
    unwrap(client.PUT("/api/admin/settings", { body: changes as Record<string, never> })),
  changeCorrectOption: (client: ApiClient, questionId: number, correctOption: number, rowVersion: string, note: string | null) =>
    unwrap(
      client.PUT("/api/questions/{id}/correct-option", {
        params: { path: { id: questionId } },
        body: { correctOption, rowVersion, note },
      }),
    ),
  dismissDispute: (client: ApiClient, questionId: number, rowVersion: string, note: string | null) =>
    unwrap(
      client.POST("/api/questions/{id}/answer-dispute/dismiss", {
        params: { path: { id: questionId } },
        body: { rowVersion, note },
      }),
    ),
};
