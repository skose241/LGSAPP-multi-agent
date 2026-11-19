import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import type { ApiClient } from "../client";
import { unwrap } from "../errors";
import type { components } from "../generated/schema";

export type AssignmentState = components["schemas"]["AssignmentEffectiveState"];
export type AssignmentManageDetail = components["schemas"]["AssignmentManageDetailView"];
export type AssignmentManageQuestion = components["schemas"]["AssignmentQuestionManageView"];
export type AssignmentResults = components["schemas"]["AssignmentResultsView"];
export type AssignmentResultStudent = components["schemas"]["AssignmentStudentRowView"];
export type AssignmentResultQuestion = components["schemas"]["AssignmentQuestionResultView"];
export type AssignmentChange = components["schemas"]["AssignmentChangeView"];
export type AddedQuestions = components["schemas"]["AddedQuestionsView"];
export type StudentAssignmentList = components["schemas"]["AssignmentStudentListView"];
export type StudentAssignmentDetail = components["schemas"]["AssignmentStudentDetailView"];
export type StudentAssignmentQuestion = components["schemas"]["AssignmentStudentQuestionView"];
export type CreateAssignmentBody = components["schemas"]["CreateAssignmentRequest"];
export type UpdateAssignmentBody = components["schemas"]["UpdateAssignmentRequest"];
export type NewAssignmentQuestion = components["schemas"]["AssignmentQuestionItemRequest"];
export type UpdateAssignmentQuestionBody = components["schemas"]["UpdateAssignmentQuestionRequest"];
export type TopicPlanDay = components["schemas"]["TopicPlanDayView"];
export type TopicPlanLesson = components["schemas"]["TopicPlanLessonView"];
export type SaveTopicPlanBody = components["schemas"]["SaveTopicPlanRequest"];

export type ResultsSort = "completion" | "name" | "correct" | "lastAnswered";
export type SortDirection = "asc" | "desc";

export interface StudentAssignmentParams {
  state: "open" | "closed";
  lessonId?: number;
  page: number;
  pageSize: number;
}

export interface ResultsParams {
  id: number;
  sort: ResultsSort;
  dir: SortDirection;
  page: number;
  pageSize: number;
}

export interface ModeratorQuestionParams {
  lessonId?: number;
  topicId?: number;
  page: number;
  pageSize: number;
}

export const assignmentKeys = {
  teacherAll: ["teacher", "assignments"] as const,
  detail: (id: number) => ["teacher", "assignments", "detail", id] as const,
  results: (params: ResultsParams) => ["teacher", "assignments", "results", params] as const,
  scheduledAll: ["teacher", "scheduled-questions"] as const,
  scheduled: (params: ModeratorQuestionParams) => ["teacher", "scheduled-questions", params] as const,
  studentAll: ["assignments"] as const,
  studentList: (params: StudentAssignmentParams) => ["assignments", "list", params] as const,
  studentDetail: (id: number) => ["assignments", "detail", id] as const,
};

export function assignmentDetailQuery(client: ApiClient, id: number) {
  return queryOptions({
    queryKey: assignmentKeys.detail(id),
    queryFn: () => unwrap(client.GET("/api/assignments/{id}/manage", { params: { path: { id } } })),
    staleTime: 0,
    retry: false,
  });
}

export function assignmentResultsQuery(client: ApiClient, params: ResultsParams) {
  return queryOptions({
    queryKey: assignmentKeys.results(params),
    queryFn: () =>
      unwrap(
        client.GET("/api/assignments/{id}/results", {
          params: { path: { id: params.id }, query: { sort: params.sort, dir: params.dir, page: params.page, pageSize: params.pageSize } },
        }),
      ),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export function scheduledQuestionsQuery(client: ApiClient, params: ModeratorQuestionParams, enabled = true) {
  return queryOptions({
    queryKey: assignmentKeys.scheduled(params),
    queryFn: () =>
      unwrap(
        client.GET("/api/questions", {
          params: { query: { lessonId: params.lessonId, topicId: params.topicId, scheduled: true, page: params.page, pageSize: params.pageSize } },
        }),
      ),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function studentAssignmentsQuery(client: ApiClient, params: StudentAssignmentParams) {
  return queryOptions({
    queryKey: assignmentKeys.studentList(params),
    queryFn: () =>
      unwrap(
        client.GET("/api/assignments", {
          params: { query: { state: params.state, lessonId: params.lessonId, page: params.page, pageSize: params.pageSize } },
        }),
      ),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

export function studentAssignmentQuery(client: ApiClient, id: number) {
  return queryOptions({
    queryKey: assignmentKeys.studentDetail(id),
    queryFn: () => unwrap(client.GET("/api/assignments/{id}", { params: { path: { id } } })),
    staleTime: 15_000,
    retry: false,
  });
}

export const assignmentMutations = {
  create: (client: ApiClient, body: CreateAssignmentBody) => unwrap(client.POST("/api/assignments", { body })),
  update: (client: ApiClient, id: number, body: UpdateAssignmentBody) =>
    unwrap(client.PATCH("/api/assignments/{id}", { params: { path: { id } }, body })),
  remove: (client: ApiClient, id: number, rowVersion: string) =>
    unwrap(client.DELETE("/api/assignments/{id}", { params: { path: { id }, query: { rowVersion } } })),
  publish: (client: ApiClient, id: number, rowVersion: string) =>
    unwrap(client.POST("/api/assignments/{id}/publish", { params: { path: { id } }, body: { rowVersion } })),
  unpublish: (client: ApiClient, id: number, rowVersion: string) =>
    unwrap(client.POST("/api/assignments/{id}/unpublish", { params: { path: { id } }, body: { rowVersion } })),
  addQuestions: (client: ApiClient, id: number, items: NewAssignmentQuestion[]) =>
    unwrap(client.POST("/api/assignments/{id}/questions", { params: { path: { id } }, body: { items } })),
  attachQuestions: (client: ApiClient, id: number, questionIds: number[]) =>
    unwrap(client.POST("/api/assignments/{id}/questions/attach", { params: { path: { id } }, body: { questionIds } })),
  reorder: (client: ApiClient, id: number, questionIds: number[]) =>
    unwrap(client.PUT("/api/assignments/{id}/questions/order", { params: { path: { id } }, body: { questionIds } })),
  updateQuestion: (client: ApiClient, id: number, questionId: number, body: UpdateAssignmentQuestionBody) =>
    unwrap(client.PATCH("/api/assignments/{id}/questions/{questionId}", { params: { path: { id, questionId } }, body })),
  removeQuestion: (client: ApiClient, id: number, questionId: number) =>
    unwrap(client.DELETE("/api/assignments/{id}/questions/{questionId}", { params: { path: { id, questionId } } })),
};
