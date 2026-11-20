export interface TextRuleInput {
  length: number;
  min: number;
  max: number;
  hasPhoto: boolean;
}

export function solutionTextState({ length, min, max, hasPhoto }: TextRuleInput): { valid: boolean; tooShort: boolean; tooLong: boolean } {
  const tooLong = length > max;
  const tooShort = !hasPhoto && length < min;
  return { valid: !tooLong && !tooShort, tooShort, tooLong };
}

export const QUESTION_DESCRIPTION_MAX = 4000;

export interface QuestionCardInput {
  lessonId: number | null;
  option: string | undefined;
  description: string;
}

export interface QuestionCardErrors {
  lesson?: string;
  option?: string;
  description?: string;
}

export function validateQuestionCard(input: QuestionCardInput, minDescription: number): QuestionCardErrors {
  const errors: QuestionCardErrors = {};
  if (input.lessonId === null) errors.lesson = "Dersi seçin.";
  if (!input.option) errors.option = "Doğru şıkkı seçin.";
  const length = input.description.trim().length;
  if (length === 0) errors.description = "Soruyu çözerken nerede takıldığınızı anlatın.";
  else if (length < minDescription) errors.description = `Açıklama en az ${minDescription} karakter olmalı.`;
  else if (length > QUESTION_DESCRIPTION_MAX) errors.description = `Açıklama en fazla ${QUESTION_DESCRIPTION_MAX} karakter olabilir.`;
  return errors;
}

export function hasErrors(errors: QuestionCardErrors): boolean {
  return Object.keys(errors).length > 0;
}

export function scoredSentence(upload: { scoredLimit: number; scoredRemaining: number; pointsPerQuestion: number } | undefined): string | null {
  if (!upload || upload.scoredLimit <= 0) return null;
  const points = upload.pointsPerQuestion > 0 ? ` Her biri ${upload.pointsPerQuestion} puan kazandırır.` : "";
  return `İlk ${upload.scoredLimit} soru puanlı. ${upload.scoredRemaining} puanlı hakkınız kaldı.${points}`;
}

export function selectableSlots(remaining: number | null, pendingCards: number, maxCards = 20): number {
  const byQuota = remaining === null ? maxCards : remaining - pendingCards;
  return Math.max(0, Math.min(byQuota, maxCards - pendingCards));
}
