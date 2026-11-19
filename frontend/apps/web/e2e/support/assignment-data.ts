import { adminToken, backend } from "./backend";
import { createTextQuestion, makePng, type ActiveUser } from "./student-data";

export function pngFile(name: string, width = 800, height = 600) {
  return { name, mimeType: "image/png", buffer: makePng(width, height) };
}

export function pngFiles(count: number, prefix = "soru") {
  return Array.from({ length: count }, (_, index) => pngFile(`${prefix}-${index + 1}.png`, 640 + index * 8, 480));
}

export async function scheduledPoolQuestion(teacher: ActiveUser, lessonId: number, text: string, date: string) {
  return createTextQuestion(teacher, lessonId, text, 2, { scheduledPublishDate: date });
}

export async function createDraftAssignment(teacher: ActiveUser, lessonId: number, title: string, startDate: string, endDate: string) {
  const created = await backend<{ id: number; rowVersion: string }>("POST", "/api/assignments", {
    token: teacher.token,
    body: { lessonId, title, description: "Taslak ödev", startDate, endDate },
  });
  if (created.status !== 201) throw new Error(`Taslak ödev oluşturulamadı: ${created.status} ${JSON.stringify(created.body)}`);
  return created.body.id;
}

export async function assignmentDetail(teacher: ActiveUser, id: number) {
  const result = await backend<{
    state: string;
    title: string;
    rowVersion: string;
    questions: { id: number; text: string | null; orderNo: number; correctOption: number; imageFileId: number | null; topic?: { id: number } | null }[];
  }>("GET", `/api/assignments/${id}/manage`, { token: teacher.token });
  if (result.status !== 200) throw new Error(`Ödev okunamadı: ${result.status} ${JSON.stringify(result.body)}`);
  return result.body;
}

export function isWeekday(date: string): boolean {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day >= 1 && day <= 5;
}

export function nextWeekdayFrom(date: string, minOffset: number): string {
  const base = new Date(`${date}T12:00:00Z`);
  for (let offset = minOffset; offset < minOffset + 14; offset += 1) {
    const candidate = new Date(base.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
    if (isWeekday(candidate)) return candidate;
  }
  throw new Error("Hafta içi bir gün bulunamadı.");
}

let scheduleReady: Promise<void> | null = null;

export function ensureFullWeekSchedule(): Promise<void> {
  if (!scheduleReady) {
    scheduleReady = (async () => {
      const token = await adminToken();
      const current = await backend<{ lessons: { id: number }[]; items: { isoDayOfWeek: number; lessonId: number; questionCount: number }[] }>("GET", "/api/admin/generation-schedule", { token });
      if (current.status !== 200) throw new Error(`Ders programı okunamadı: ${current.status}`);
      const existing = new Map(current.body.items.map((item) => [`${item.isoDayOfWeek}-${item.lessonId}`, item.questionCount]));
      const items: { isoDayOfWeek: number; lessonId: number; questionCount: number }[] = [];
      let changed = false;
      for (const lesson of current.body.lessons) {
        for (let day = 1; day <= 7; day += 1) {
          const count = existing.get(`${day}-${lesson.id}`) ?? 0;
          if (count === 0) changed = true;
          items.push({ isoDayOfWeek: day, lessonId: lesson.id, questionCount: Math.max(count, 1) });
        }
      }
      if (!changed) return;
      const saved = await backend("PUT", "/api/admin/generation-schedule", { token, body: { items } });
      if (saved.status !== 200) throw new Error(`Ders programı yazılamadı: ${saved.status} ${JSON.stringify(saved.body)}`);
    })();
  }
  return scheduleReady;
}

export async function clearTopicPlan(token: string, date: string, lessonId: number) {
  await backend("DELETE", `/api/topic-plans/${date}/${lessonId}`, { token });
}

export async function setTopicPlan(token: string, date: string, lessonId: number, topicId: number) {
  const result = await backend("PUT", `/api/topic-plans/${date}/${lessonId}`, { token, body: { topicId, targetCount: null, rowVersion: null } });
  if (result.status !== 200) throw new Error(`Konu planı yazılamadı: ${result.status} ${JSON.stringify(result.body)}`);
}

export async function addTextQuestionsApi(teacher: ActiveUser, id: number, count: number, label: string) {
  const items = Array.from({ length: count }, (_, index) => ({
    text: `${label} soru ${index + 1}`,
    imageFileId: null,
    optionA: "A1",
    optionB: "B1",
    optionC: "C1",
    optionD: "D1",
    correctOption: 2,
    topicId: null,
    description: null,
  }));
  const added = await backend("POST", `/api/assignments/${id}/questions`, { token: teacher.token, body: { items } });
  if (added.status !== 201) throw new Error(`Ödev sorusu eklenemedi: ${added.status} ${JSON.stringify(added.body)}`);
}
