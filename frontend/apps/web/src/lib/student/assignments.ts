export type StudentAssignmentTab = "open" | "closed";

export interface StudentAssignmentFilters {
  tab: StudentAssignmentTab;
  lessonId?: number;
  page: number;
}

function positiveInt(value: string | null): number | undefined {
  if (!value || !/^[0-9]{1,9}$/.test(value)) return undefined;
  const parsed = Number(value);
  return parsed > 0 ? parsed : undefined;
}

export function parseStudentAssignmentFilters(params: URLSearchParams): StudentAssignmentFilters {
  return {
    tab: params.get("durum") === "kapandi" ? "closed" : "open",
    lessonId: positiveInt(params.get("ders")),
    page: positiveInt(params.get("sayfa")) ?? 1,
  };
}

export function studentAssignmentFiltersToSearch(filters: StudentAssignmentFilters): string {
  const params = new URLSearchParams();
  if (filters.tab === "closed") params.set("durum", "kapandi");
  if (filters.lessonId) params.set("ders", String(filters.lessonId));
  if (filters.page > 1) params.set("sayfa", String(filters.page));
  const text = params.toString();
  return text ? `?${text}` : "";
}

export type QuestionProgress = "correct" | "wrong" | "answered" | "pending" | "locked";

export function questionProgress(question: { myAnswer: { isCorrect: boolean } | null | undefined; canAnswer: boolean }): QuestionProgress {
  if (question.myAnswer) return question.myAnswer.isCorrect ? "correct" : "wrong";
  return question.canAnswer ? "pending" : "locked";
}

export function nextUnanswered<T extends { id: number; myAnswer: unknown; canAnswer: boolean }>(questions: readonly T[]): T | undefined {
  return questions.find((question) => !question.myAnswer && question.canAnswer);
}

export function assignmentQuestionHref(questionId: number, assignmentId: number): string {
  return `/sorular/${questionId}?odev=${assignmentId}`;
}

export function parseAssignmentBack(value: string | null): number | null {
  if (!value || !/^[0-9]{1,9}$/.test(value)) return null;
  const parsed = Number(value);
  return parsed > 0 ? parsed : null;
}
