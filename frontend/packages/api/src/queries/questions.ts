import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import type { ApiClient } from "../client";
import { unwrap } from "../errors";
import type { components } from "../generated/schema";

export type QuestionPoolItem = components["schemas"]["QuestionPoolItemView"];
export type QuestionPoolList = components["schemas"]["QuestionPoolListView"];
export type QuestionDetail = components["schemas"]["QuestionDetailView"];
export type AnswerResult = components["schemas"]["AnswerResultView"];
export type ImageInfo = components["schemas"]["ImageView"];
export type MyQuestion = components["schemas"]["MyQuestionView"];
export type MyQuestionList = components["schemas"]["MyQuestionListView"];
export type CreateQuestionBody = components["schemas"]["CreateQuestionRequest"];

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
  mine: (page: number, pageSize: number) => [...questionKeys.all, "mine", page, pageSize] as const,
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

export function myQuestionsQuery(client: ApiClient, page: number, pageSize: number) {
  return queryOptions({
    queryKey: questionKeys.mine(page, pageSize),
    queryFn: () => unwrap(client.GET("/api/questions/mine", { params: { query: { page, pageSize } } })),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

export function studentQuestionBody(input: {
  lessonId: number;
  topicId: number | null;
  imageFileId: number;
  correctOption: number;
  description: string;
  clientRequestId: string;
}): CreateQuestionBody {
  return {
    lessonId: input.lessonId,
    topicId: input.topicId,
    text: null,
    imageFileId: input.imageFileId,
    optionA: null,
    optionB: null,
    optionC: null,
    optionD: null,
    correctOption: input.correctOption,
    description: input.description,
    scheduledPublishDate: null,
    clientRequestId: input.clientRequestId,
  };
}

export const questionMutations = {
  create: (client: ApiClient, body: CreateQuestionBody) => unwrap(client.POST("/api/questions", { body })),
  submitAnswer: (client: ApiClient, id: number, selectedOption: number, solutionText: string | null, solutionImageFileId: number | null = null) =>
    unwrap(
      client.POST("/api/questions/{id}/answers", {
        params: { path: { id } },
        body: { selectedOption, solutionText, solutionImageFileId },
      }),
    ),
  like: (client: ApiClient, id: number) =>
    unwrap(client.PUT("/api/questions/{id}/like", { params: { path: { id } } })),
  unlike: (client: ApiClient, id: number) =>
    unwrap(client.DELETE("/api/questions/{id}/like", { params: { path: { id } } })),
  report: (client: ApiClient, id: number, reason: components["schemas"]["ReportReason"], description: string) =>
    unwrap(client.POST("/api/questions/{id}/reports", { params: { path: { id } }, body: { reason, description } })),
};
