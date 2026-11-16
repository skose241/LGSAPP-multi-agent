import type { Page } from "@playwright/test";
import { activeUser, createTextQuestion, lessonsFor, publicSettings, type ActiveUser } from "./student-data";
import { expect, login } from "./fixtures";

export interface World {
  teacher: ActiveUser;
  lessons: { id: number; name: string; topics: { id: number; name: string }[] }[];
  settings: Awaited<ReturnType<typeof publicSettings>>;
}

let cached: Promise<World> | null = null;

export function world(): Promise<World> {
  if (!cached) {
    cached = (async () => {
      const teacher = await activeUser("ogretmen", "hoca");
      const lessons = await lessonsFor(teacher.token);
      const settings = await publicSettings(teacher.token);
      return { teacher, lessons, settings };
    })();
  }
  return cached;
}

export async function freshQuestion(text?: string, correctOption = 2, lessonIndex = 0) {
  const w = await world();
  const lesson = w.lessons[lessonIndex] ?? w.lessons[0]!;
  const body = text ?? `Deneme sorusu ${Date.now().toString(36)}: Hangisi doğrudur?`;
  const question = await createTextQuestion(w.teacher, lesson.id, body, correctOption);
  return { question, lesson, world: w };
}

export async function studentLogin(page: Page, prefix = "ogrenci") {
  const student = await activeUser("ogrenci", prefix);
  await login(page, student.userName, student.password);
  await expect(page.getByRole("heading", { name: /Merhaba/ })).toBeVisible();
  return student;
}

export function validExplanation(minLength: number): string {
  const base = "Önce verilenleri yazdım, sonra şıkları tek tek eleyerek sonuca ulaştım. ";
  return base.repeat(Math.ceil((minLength + 5) / base.length));
}
