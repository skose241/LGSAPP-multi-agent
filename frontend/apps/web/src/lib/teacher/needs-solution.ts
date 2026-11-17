import { isApiError } from "@lgs/api";

export const NO_BRANCH_FALLBACK = "Hesabınıza branş dersi tanımlanmamış.";

export function thresholdSentence(answers: number, wrongRate: number): string {
  return `En az ${answers} öğrencinin çözdüğü ve yanlış oranı %${wrongRate} ve üzeri olan sorular`;
}

export function wrongRateLabel(rate: number): string {
  return `%${Math.round(rate)}`;
}

export function isForbidden(error: unknown): boolean {
  return isApiError(error) && error.status === 403;
}

export function isNoBranch(role: string | undefined, branchLessonId: number | null | undefined): boolean {
  return role === "ogretmen" && (branchLessonId === null || branchLessonId === undefined);
}

export function solutionHref(questionId: number): string {
  return `/sorular/${questionId}?cozum=ogretmen`;
}
