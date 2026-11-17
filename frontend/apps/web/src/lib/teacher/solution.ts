export interface TeacherSolutionInput {
  length: number;
  max: number;
  hasPhoto: boolean;
}

export function teacherSolutionState({ length, max, hasPhoto }: TeacherSolutionInput): { valid: boolean; tooLong: boolean; empty: boolean } {
  const tooLong = length > max;
  const empty = length === 0 && !hasPhoto;
  return { valid: !tooLong && !empty, tooLong, empty };
}
