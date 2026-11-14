export const OPTION_LETTERS = ["A", "B", "C", "D"] as const;
export type OptionLetter = (typeof OPTION_LETTERS)[number];
export type OptionNumber = 1 | 2 | 3 | 4;

export function optionToLetter(option: number): OptionLetter | null {
  if (!Number.isInteger(option) || option < 1 || option > 4) return null;
  return OPTION_LETTERS[option - 1] ?? null;
}

export function letterToOption(letter: string): OptionNumber | null {
  const index = OPTION_LETTERS.indexOf(letter.trim().toUpperCase() as OptionLetter);
  return index === -1 ? null : ((index + 1) as OptionNumber);
}
