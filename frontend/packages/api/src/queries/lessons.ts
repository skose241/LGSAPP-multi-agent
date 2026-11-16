import { queryOptions } from "@tanstack/react-query";
import type { ApiClient } from "../client";
import { unwrap } from "../errors";
import type { components } from "../generated/schema";

export type Lesson = components["schemas"]["LessonView"];
export type Topic = components["schemas"]["TopicView"];

export const lessonKeys = {
  all: ["lessons"] as const,
  topics: (lessonId: number) => ["lessons", lessonId, "topics"] as const,
};

export function lessonsQuery(client: ApiClient) {
  return queryOptions({
    queryKey: lessonKeys.all,
    queryFn: () => unwrap(client.GET("/api/lessons")),
    staleTime: 10 * 60_000,
  });
}

export function topicsQuery(client: ApiClient, lessonId: number | undefined) {
  return queryOptions({
    queryKey: lessonKeys.topics(lessonId ?? 0),
    queryFn: () => unwrap(client.GET("/api/lessons/{id}/topics", { params: { path: { id: lessonId ?? 0 } } })),
    enabled: lessonId !== undefined,
    staleTime: 10 * 60_000,
  });
}
