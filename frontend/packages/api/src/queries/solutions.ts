import { queryOptions } from "@tanstack/react-query";
import type { ApiClient } from "../client";
import { unwrap } from "../errors";
import type { components } from "../generated/schema";

export type Solution = components["schemas"]["SolutionView"];

export const solutionKeys = {
  list: (questionId: number) => ["solutions", questionId] as const,
};

export function solutionsQuery(client: ApiClient, questionId: number, enabled = true) {
  return queryOptions({
    queryKey: solutionKeys.list(questionId),
    queryFn: () => unwrap(client.GET("/api/questions/{id}/solutions", { params: { path: { id: questionId } } })),
    staleTime: 20 * 60_000,
    enabled,
  });
}

export const solutionMutations = {
  update: (client: ApiClient, id: number, text: string | null, imageFileId: number | null, rowVersion: string) =>
    unwrap(
      client.PATCH("/api/solutions/{id}", {
        params: { path: { id } },
        body: { text, imageFileId, rowVersion },
      }),
    ),
  report: (client: ApiClient, id: number, reason: components["schemas"]["ReportReason"], description: string) =>
    unwrap(client.POST("/api/solutions/{id}/reports", { params: { path: { id } }, body: { reason, description } })),
};
