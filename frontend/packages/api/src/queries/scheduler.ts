import { queryOptions } from "@tanstack/react-query";
import type { ApiClient } from "../client";
import { unwrap } from "../errors";
import type { components } from "../generated/schema";

export type SchedulerStatus = components["schemas"]["SchedulerStatusView"];
export type SchedulerJob = components["schemas"]["SchedulerJobStatus"];
export type TodayLesson = components["schemas"]["TodayLessonStatus"];
export type SchedulerRun = components["schemas"]["RunView"];
export type SchedulerRunPage = components["schemas"]["RunPage"];
export type SchedulerRunDetail = components["schemas"]["RunDetailResponse"];
export type SchedulerRunLog = components["schemas"]["RunLogView"];

export type SchedulerKind = "generate" | "complete" | "publish" | "assignments";

export interface SchedulerRunsParams {
  kind?: string;
  status?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export const schedulerKeys = {
  all: ["admin", "scheduler"] as const,
  status: () => [...schedulerKeys.all, "status"] as const,
  runs: (params: SchedulerRunsParams) => [...schedulerKeys.all, "runs", params] as const,
  runsAll: () => [...schedulerKeys.all, "runs"] as const,
  run: (id: number) => [...schedulerKeys.all, "run", id] as const,
};

export function schedulerStatusQuery(client: ApiClient) {
  return queryOptions({
    queryKey: schedulerKeys.status(),
    queryFn: () => unwrap(client.GET("/api/admin/scheduler/status")),
    staleTime: 10_000,
  });
}

export function schedulerRunsQuery(client: ApiClient, params: SchedulerRunsParams = {}) {
  return queryOptions({
    queryKey: schedulerKeys.runs(params),
    queryFn: () => unwrap(client.GET("/api/admin/scheduler/runs", { params: { query: params } })),
    staleTime: 10_000,
  });
}

export function schedulerRunQuery(client: ApiClient, id: number) {
  return queryOptions({
    queryKey: schedulerKeys.run(id),
    queryFn: () => unwrap(client.GET("/api/admin/scheduler/runs/{id}", { params: { path: { id } } })),
    staleTime: 0,
    refetchInterval: (query) => (query.state.data?.status === "running" ? 3_000 : false),
    refetchIntervalInBackground: false,
  });
}

export const schedulerMutations = {
  startRun: (client: ApiClient, kind: SchedulerKind) =>
    unwrap(client.POST("/api/admin/scheduler/runs", { body: { kind } })),
};
