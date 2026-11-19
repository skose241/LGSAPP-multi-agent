import { adminToken, backend } from "./backend";
import { answerQuestion, branchTeacher, createTextQuestion, type ActiveUser } from "./student-data";

export { branchTeacher, setBranch } from "./student-data";
import { authorFor, validExplanation, world } from "./world";

export interface AiSolutionResult {
  status: number;
  body: { detail?: string; status?: string; message?: string; solution?: { id: number; text: string | null; isHidden: boolean } | null; quota?: { remainingToday: number } | null } | null;
  retryAfter: string | null;
}

const DAILY_LIMIT = /hakkınız doldu|bugün için yoğun/i;

export async function requestAi(user: ActiveUser, questionId: number): Promise<AiSolutionResult> {
  for (let attempt = 0; ; attempt += 1) {
    const result = await backend<AiSolutionResult["body"]>("POST", `/api/questions/${questionId}/solutions/ai`, { token: user.token });
    const outcome = { status: result.status, body: result.body, retryAfter: result.headers.get("retry-after") };
    const rateLimited = result.status === 429 && !DAILY_LIMIT.test(result.body?.detail ?? "");
    if (!rateLimited || attempt >= 3) return outcome;
    const wait = Number(outcome.retryAfter ?? "20");
    await new Promise((resolve) => setTimeout(resolve, (Number.isFinite(wait) ? wait : 20) * 1000 + 500));
  }
}

export async function setSettings(changes: Record<string, number>) {
  const current = await readSettings();
  const differing = Object.fromEntries(Object.entries(changes).filter(([key, value]) => current[key] !== value));
  if (Object.keys(differing).length === 0) return;
  const token = await adminToken();
  const result = await backend("PUT", "/api/admin/settings", { token, body: differing });
  if (result.status !== 200) throw new Error(`Ayar yazılamadı: ${result.status} ${JSON.stringify(result.body)}`);
}

export async function readSettings(): Promise<Record<string, number>> {
  const token = await adminToken();
  const result = await backend<{ key: string; value: number }[]>("GET", "/api/admin/settings", { token });
  return Object.fromEntries(result.body.map((item) => [item.key, item.value]));
}

export interface Dispute {
  questionId: number;
  questionText: string;
  lessonId: number;
  lessonName: string;
  teacher: ActiveUser;
  originalKey: number;
  aiOption: number;
}

const MAX_ATTEMPTS = 6;

export async function produceDispute(lessonIndex = 0): Promise<Dispute> {
  const w = await world();
  const lesson = w.lessons[lessonIndex] ?? w.lessons[0]!;
  const creator = await authorFor(lesson.id);
  const originalKey = 2;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const teacher = await branchTeacher(lesson.id);
    const text = `Şüpheli anahtar sorusu ${Date.now().toString(36)}${attempt}: Hangisi doğrudur?`;
    const question = await createTextQuestion(creator, lesson.id, text, originalKey);
    const result = await requestAi(teacher, question.id);
    if (result.status === 200 && result.body?.status === "underReview") {
      return {
        questionId: question.id,
        questionText: text,
        lessonId: lesson.id,
        lessonName: lesson.name,
        teacher,
        originalKey,
        aiOption: (originalKey % 4) + 1,
      };
    }
    if (result.status !== 201) throw new Error(`AI isteği beklenmedik sonuç verdi: ${result.status} ${JSON.stringify(result.body)}`);
  }
  throw new Error("Sahte yapay zekâ uyuşmazlık üretmedi; Ai__Fake__MismatchEveryNth=4 ile başlatıldığından emin olun.");
}

export async function answeredQuestion(student: ActiveUser, creator: ActiveUser, lessonId: number, option = 2, label = "Soru") {
  const w = await world();
  const question = await createTextQuestion(creator, lessonId, `${label} ${Date.now().toString(36)}: Hangisi doğrudur?`, 2);
  await answerQuestion(student, question.id, option, validExplanation(w.settings.aciklamaMinKarakter));
  return question;
}
