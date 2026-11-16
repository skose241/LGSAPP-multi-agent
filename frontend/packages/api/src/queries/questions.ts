import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import type { ApiClient } from "../client";
import { unwrap } from "../errors";
import type { components } from "../generated/schema";

export type QuestionPoolItem = components["schemas"]["QuestionPoolItemView"];
export type QuestionPoolList = components["schemas"]["QuestionPoolListView"];
export type QuestionDetail = components["schemas"]["QuestionDetailView"];
export type AnswerResult = components["schemas"]["AnswerResultView"];
export type ImageInfo = components["schemas"]["ImageView"];

export type AnsweredFilter = "all" | "unanswered" | "answered";

export interface QuestionListParams {
  lessonId?: number;
  topicId?: number;
  source?: "teacher" | "student" | "ai";
  answered: AnsweredFilter;
  since?: number;
  page: number;
  pageSize: number;
}

export const questionKeys = {
  all: ["questions"] as const,
  list: (params: QuestionListParams) => [...questionKeys.all, "list", params] as const,
  detail: (id: number) => [...questionKeys.all, "detail", id] as const,
};

export function imageSource(image: ImageInfo | null | undefined, variant: "thumb" | "full") {
  if (!image) return null;
  if (variant === "thumb" && image.thumbnailUrl) {
    return {
      url: image.thumbnailUrl,
      width: image.thumbnailWidth ?? image.width,
      height: image.thumbnailHeight ?? image.height,
    };
  }
  return { url: image.url, width: image.width, height: image.height };
}

export function questionsQuery(client: ApiClient, params: QuestionListParams) {
  return queryOptions({
    queryKey: questionKeys.list(params),
    queryFn: () =>
      unwrap(
        client.GET("/api/questions", {
          params: {
            query: {
              lessonId: params.lessonId,
              topicId: params.topicId,
              source: params.source,
              answered: params.answered === "all" ? undefined : params.answered === "answered",
              since: params.since,
              page: params.page,
              pageSize: params.pageSize,
            },
          },
        }),
      ),
    staleTime: 20 * 60_000,
    placeholderData: keepPreviousData,
  });
}

export function questionQuery(client: ApiClient, id: number) {
  return queryOptions({
    queryKey: questionKeys.detail(id),
    queryFn: () => unwrap(client.GET("/api/questions/{id}", { params: { path: { id } } })),
    staleTime: 20 * 60_000,
  });
}

export const questionMutations = {
  submitAnswer: (client: ApiClient, id: number, selectedOption: number, solutionText: string) =>
    unwrap(
      client.POST("/api/questions/{id}/answers", {
        params: { path: { id } },
        body: { selectedOption, solutionText, solutionImageFileId: null },
      }),
    ),
  like: (client: ApiClient, id: number) =>
    unwrap(client.PUT("/api/questions/{id}/like", { params: { path: { id } } })),
  unlike: (client: ApiClient, id: number) =>
    unwrap(client.DELETE("/api/questions/{id}/like", { params: { path: { id } } })),
  report: (client: ApiClient, id: number, reason: components["schemas"]["ReportReason"], description: string) =>
    unwrap(client.POST("/api/questions/{id}/reports", { params: { path: { id } }, body: { reason, description } })),
};
