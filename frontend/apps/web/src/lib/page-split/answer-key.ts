export interface ParsedAnswerKey {
  answers: Map<number, string>;
  invalid: string[];
}

const LETTER_ONLY = /^[A-Da-d\s,;.-]+$/;
const TOKEN = /^(\d{1,3})[-.):=]?([A-Da-d])$/;
const GLUE_SEPARATED = /(\d)\s*[-.):=]\s*([A-Da-d])(?![\p{L}])/gu;
const GLUE_SPACED = /(\d)\s+([A-Da-d])(?![\p{L}])/gu;

export function parseAnswerKey(text: string, startNumber = 1): ParsedAnswerKey {
  const answers = new Map<number, string>();
  const invalid: string[] = [];
  const trimmed = text.trim();
  if (trimmed === "") return { answers, invalid };

  if (LETTER_ONLY.test(trimmed)) {
    const letters = trimmed.replace(/[\s,;.-]/g, "").toUpperCase();
    let number = startNumber;
    for (const letter of letters) {
      answers.set(number, letter);
      number += 1;
    }
    return { answers, invalid };
  }

  const normalized = trimmed.replace(GLUE_SEPARATED, "$1$2").replace(GLUE_SPACED, "$1$2");
  for (const token of normalized.split(/[\s,;]+/).filter(Boolean)) {
    const match = TOKEN.exec(token);
    if (!match) {
      invalid.push(token);
      continue;
    }
    answers.set(Number(match[1]), match[2]!.toUpperCase());
  }
  return { answers, invalid };
}
