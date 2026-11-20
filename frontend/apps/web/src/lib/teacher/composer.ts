export const CARD_DESCRIPTION_MAX = 2000;

export interface ComposerCardInput {
  option: string | undefined;
  description: string;
}

export interface ComposerCardErrors {
  option?: string;
  description?: string;
}

export function validateComposerCard(input: ComposerCardInput): ComposerCardErrors {
  const errors: ComposerCardErrors = {};
  if (!input.option) errors.option = "Doğru şıkkı seçin.";
  if (input.description.trim().length > CARD_DESCRIPTION_MAX) {
    errors.description = `Açıklama en fazla ${CARD_DESCRIPTION_MAX} karakter olabilir.`;
  }
  return errors;
}

export function cardsSelectable(pendingCards: number, maxCards: number): number {
  return Math.max(0, maxCards - pendingCards);
}

export function textOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export interface TextQuestionInput {
  text: string;
  options: [string, string, string, string];
  option: string | undefined;
}

export interface TextQuestionErrors {
  text?: string;
  options?: string;
  option?: string;
}

export const QUESTION_TEXT_MAX = 8000;
export const OPTION_TEXT_MAX = 500;

export function validateTextQuestion(input: TextQuestionInput): TextQuestionErrors {
  const errors: TextQuestionErrors = {};
  const text = input.text.trim();
  if (text === "") errors.text = "Soru metnini yazın.";
  else if (text.length > QUESTION_TEXT_MAX) errors.text = `Soru metni en fazla ${QUESTION_TEXT_MAX} karakter olabilir.`;
  const filled = input.options.filter((entry) => entry.trim() !== "").length;
  if (filled > 0 && filled < 4) errors.options = "Şıklar ya hep birlikte girilmeli ya da hiç girilmemeli.";
  else if (input.options.some((entry) => entry.trim().length > OPTION_TEXT_MAX)) errors.options = `Şık en fazla ${OPTION_TEXT_MAX} karakter olabilir.`;
  if (!input.option) errors.option = "Doğru şıkkı seçin.";
  return errors;
}
