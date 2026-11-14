import { queryOptions } from "@tanstack/react-query";
import type { ApiClient } from "../client";
import { unwrap } from "../errors";
import type { components } from "../generated/schema";

export type Lesson = components["schemas"]["LessonView"];

export const lessonKeys = {
  all: ["lessons"] as const,
};

export function lessonsQuery(client: ApiClient) {
  return queryOptions({
    queryKey: lessonKeys.all,
    queryFn: () => unwrap(client.GET("/api/lessons")),
    staleTime: 10 * 60_000,
  });
}
