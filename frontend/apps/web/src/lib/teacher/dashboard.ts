import type { TopicPlanRange } from "@lgs/api/queries";

export interface UnplannedLesson {
  lessonId: number;
  lessonName: string;
}

export function unplannedLessons(range: TopicPlanRange): UnplannedLesson[] {
  const result: UnplannedLesson[] = [];
  for (const day of range.days) {
    for (const lesson of day.lessons) {
      if (lesson.topic === null && lesson.targetCount > 0) {
        result.push({ lessonId: lesson.lessonId, lessonName: lesson.lessonName });
      }
    }
  }
  return result;
}
