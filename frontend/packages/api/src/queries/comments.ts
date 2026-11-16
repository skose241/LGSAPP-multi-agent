import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import type { ApiClient } from "../client";
import { unwrap } from "../errors";
import type { components } from "../generated/schema";

export type Comment = components["schemas"]["CommentView"];
export type CommentThread = components["schemas"]["CommentThreadView"];
export type CommentSubthread = components["schemas"]["CommentSubthreadView"];

export type CommentSort = "oldest" | "newest";

export interface CommentScope {
  questionId: number;
  solutionId: number | null;
  sort: CommentSort;
}

export const commentKeys = {
  all: ["comments"] as const,
  roots: (scope: CommentScope) => [...commentKeys.all, "roots", scope] as const,
  thread: (id: number) => [...commentKeys.all, "thread", id] as const,
};

export const COMMENT_PAGE_SIZE = 20;

export function commentsInfiniteQuery(client: ApiClient, scope: CommentScope, enabled = true) {
  return infiniteQueryOptions({
    queryKey: commentKeys.roots(scope),
    initialPageParam: 1,
    enabled,
    staleTime: 30_000,
    queryFn: ({ pageParam }) =>
      unwrap(
        client.GET("/api/questions/{questionId}/comments", {
          params: {
            path: { questionId: scope.questionId },
            query: {
              solutionId: scope.solutionId ?? undefined,
              sort: scope.sort,
              page: pageParam,
              pageSize: COMMENT_PAGE_SIZE,
            },
          },
        }),
      ),
    getNextPageParam: (last) => (last.page * last.pageSize < last.totalRootCount ? last.page + 1 : undefined),
  });
}

export function commentThreadQuery(client: ApiClient, id: number) {
  return queryOptions({
    queryKey: commentKeys.thread(id),
    queryFn: () => unwrap(client.GET("/api/comments/{id}/thread", { params: { path: { id } } })),
    staleTime: 30_000,
  });
}

export const commentMutations = {
  create: (client: ApiClient, questionId: number, body: string, parentId: number | null, solutionId: number | null) =>
    unwrap(
      client.POST("/api/questions/{questionId}/comments", {
        params: { path: { questionId } },
        body: { body, parentId, solutionId },
      }),
    ),
  edit: (client: ApiClient, id: number, body: string, rowVersion: string) =>
    unwrap(client.PATCH("/api/comments/{id}", { params: { path: { id } }, body: { body, rowVersion } })),
  remove: (client: ApiClient, id: number) =>
    unwrap(client.DELETE("/api/comments/{id}", { params: { path: { id } } })),
  report: (client: ApiClient, id: number, reason: components["schemas"]["ReportReason"], description: string) =>
    unwrap(client.POST("/api/comments/{id}/reports", { params: { path: { id } }, body: { reason, description } })),
};
