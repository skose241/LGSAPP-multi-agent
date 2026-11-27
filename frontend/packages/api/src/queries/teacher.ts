import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import type { ApiClient } from "../client";
import { unwrap } from "../errors";
import type { components } from "../generated/schema";

export type StudentList = components["schemas"]["StudentListView"];
export type StudentListItem = components["schemas"]["StudentListItemView"];
export type StudentProfileStats = components["schemas"]["StudentProfileStatsView"];
export type StudentSort = "name" | "points" | "answered" | "lastActive";
export type NeedsSolutionList = components["schemas"]["NeedsSolutionListView"];
export type NeedsSolutionItem = components["schemas"]["NeedsSolutionItemView"];
export type ReportList = components["schemas"]["ReportListView"];
export type ReportItem = components["schemas"]["ReportItemView"];
export type ReportDetail = components["schemas"]["ReportDetailView"];
export type ReportResolveResult = components["schemas"]["ReportResolveView"];
export type ReportStatusValue = components["schemas"]["ReportStatus"];
export type ReportTargetTypeValue = components["schemas"]["ReportTargetType"];
export type ReportReasonFilter = components["schemas"]["ReportReason"];
export type ReportResolveActionValue = components["schemas"]["ReportResolveAction"];
export type TopicPlanRange = components["schemas"]["TopicPlanRangeView"];
export type AssignmentManageList = components["schemas"]["AssignmentManageListView"];
export type AssignmentManageItem = components["schemas"]["AssignmentManageItemView"];
export type StudentUploads = components["schemas"]["StudentUploadsView"];
export type StudentUploadItem = components["schemas"]["StudentUploadItemView"];
export type StudentAnswers = components["schemas"]["StudentAnswersView"];
export type StudentAnswerItem = components["schemas"]["StudentAnswerItemView"];
export type StudentAnswersSummary = components["schemas"]["StudentAnswersSummaryView"];
export type TeacherSolutionResult = components["schemas"]["SolutionView"];

export interface StudentListParams {
  search: string;
  sort: StudentSort;
  page: number;
  pageSize: number;
}

export interface StudentUploadsParams {
  page: number;
  pageSize: number;
}

export interface StudentAnswersParams {
  lessonId?: number;
  page: number;
  pageSize: number;
}

export interface NeedsSolutionParams {
  lessonId?: number;
  dismissed?: boolean;
  page: number;
  pageSize: number;
}

export interface ReportListParams {
  status?: ReportStatusValue;
  targetType?: ReportTargetTypeValue;
  reason?: ReportReasonFilter;
  questionId?: number;
  page: number;
  pageSize: number;
}

export interface ManageAssignmentParams {
  status?: "draft" | "scheduled" | "open" | "closed";
  lessonId?: number;
  mine?: boolean;
  page: number;
  pageSize: number;
}

export const teacherKeys = {
  all: ["teacher"] as const,
  students: ["teacher", "students"] as const,
  studentList: (params: StudentListParams) => ["teacher", "students", "list", params] as const,
  student: (id: number) => ["teacher", "students", "detail", id] as const,
  studentUploads: (id: number, params: StudentUploadsParams) => ["teacher", "students", "uploads", id, params] as const,
  studentAnswers: (id: number, params: StudentAnswersParams) => ["teacher", "students", "answers", id, params] as const,
  needsAll: ["teacher", "needs-solution"] as const,
  needs: (params: NeedsSolutionParams) => ["teacher", "needs-solution", params] as const,
  reportsAll: ["teacher", "reports"] as const,
  reports: (params: ReportListParams) => ["teacher", "reports", "list", params] as const,
  report: (id: number) => ["teacher", "reports", "detail", id] as const,
  topicPlansAll: ["teacher", "topic-plans"] as const,
  topicPlans: (from: string, to: string) => ["teacher", "topic-plans", from, to] as const,
  manageAssignments: (params: ManageAssignmentParams) => ["teacher", "assignments", "manage", params] as const,
};

export function studentsQuery(client: ApiClient, params: StudentListParams) {
  return queryOptions({
    queryKey: teacherKeys.studentList(params),
    queryFn: () =>
      unwrap(
        client.GET("/api/students", {
          params: {
            query: {
              search: params.search === "" ? undefined : params.search,
              sort: params.sort,
              page: params.page,
              pageSize: params.pageSize,
            },
          },
        }),
      ),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

export function studentProfileQuery(client: ApiClient, id: number) {
  return queryOptions({
    queryKey: teacherKeys.student(id),
    queryFn: () => unwrap(client.GET("/api/students/{id}/stats", { params: { path: { id } } })),
    staleTime: 30_000,
    retry: false,
  });
}

export function studentUploadsQuery(client: ApiClient, id: number, params: StudentUploadsParams) {
  return queryOptions({
    queryKey: teacherKeys.studentUploads(id, params),
    queryFn: () =>
      unwrap(
        client.GET("/api/students/{id}/questions", {
          params: { path: { id }, query: { page: params.page, pageSize: params.pageSize } },
        }),
      ),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export function studentAnswersQuery(client: ApiClient, id: number, params: StudentAnswersParams) {
  return queryOptions({
    queryKey: teacherKeys.studentAnswers(id, params),
    queryFn: () =>
      unwrap(
        client.GET("/api/students/{id}/answers", {
          params: { path: { id }, query: { lessonId: params.lessonId, page: params.page, pageSize: params.pageSize } },
        }),
      ),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export function needsSolutionQuery(client: ApiClient, params: NeedsSolutionParams, enabled = true) {
  return queryOptions({
    queryKey: teacherKeys.needs(params),
    queryFn: () =>
      unwrap(
        client.GET("/api/questions/needs-solution", {
          params: { query: { lessonId: params.lessonId, dismissed: params.dismissed ? true : undefined, page: params.page, pageSize: params.pageSize } },
        }),
      ),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
    retry: false,
    enabled,
  });
}

export function reportsQuery(client: ApiClient, params: ReportListParams) {
  return queryOptions({
    queryKey: teacherKeys.reports(params),
    queryFn: () =>
      unwrap(
        client.GET("/api/admin/reports", {
          params: {
            query: {
              status: params.status,
              targetType: params.targetType,
              reason: params.reason,
              questionId: params.questionId,
              page: params.page,
              pageSize: params.pageSize,
            },
          },
        }),
      ),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
}

export function reportDetailQuery(client: ApiClient, id: number) {
  return queryOptions({
    queryKey: teacherKeys.report(id),
    queryFn: () => unwrap(client.GET("/api/admin/reports/{id}", { params: { path: { id } } })),
    staleTime: 0,
    retry: false,
  });
}

export function topicPlansQuery(client: ApiClient, from: string, to: string) {
  return queryOptions({
    queryKey: teacherKeys.topicPlans(from, to),
    queryFn: () => unwrap(client.GET("/api/topic-plans", { params: { query: { from, to } } })),
    staleTime: 60_000,
  });
}

export function manageAssignmentsQuery(client: ApiClient, params: ManageAssignmentParams) {
  return queryOptions({
    queryKey: teacherKeys.manageAssignments(params),
    queryFn: () =>
      unwrap(
        client.GET("/api/assignments/manage", {
          params: { query: { status: params.status, lessonId: params.lessonId, mine: params.mine ? true : undefined, page: params.page, pageSize: params.pageSize } },
        }),
      ),
    staleTime: 30_000,
  });
}

export const teacherMutations = {
  saveTopicPlan: (client: ApiClient, date: string, lessonId: number, body: components["schemas"]["SaveTopicPlanRequest"]) =>
    unwrap(client.PUT("/api/topic-plans/{date}/{lessonId}", { params: { path: { date, lessonId } }, body })),
  deleteTopicPlan: (client: ApiClient, date: string, lessonId: number, rowVersion: string) =>
    unwrap(client.DELETE("/api/topic-plans/{date}/{lessonId}", { params: { path: { date, lessonId }, query: { rowVersion } } })),
  markSolutionNotNeeded: (client: ApiClient, id: number) =>
    unwrap(client.PUT("/api/questions/{id}/solution-not-needed", { params: { path: { id } } })),
  clearSolutionNotNeeded: (client: ApiClient, id: number) =>
    unwrap(client.DELETE("/api/questions/{id}/solution-not-needed", { params: { path: { id } } })),
  createTeacherSolution: (client: ApiClient, id: number, text: string | null, imageFileId: number | null) =>
    unwrap(client.POST("/api/questions/{id}/solutions/teacher", { params: { path: { id } }, body: { text, imageFileId } })),
  resolveReport: (
    client: ApiClient,
    id: number,
    body: { action: ReportResolveActionValue; note: string | null; correctOption: number | null; rowVersion: string },
  ) => unwrap(client.POST("/api/admin/reports/{id}/resolve", { params: { path: { id } }, body })),
};
