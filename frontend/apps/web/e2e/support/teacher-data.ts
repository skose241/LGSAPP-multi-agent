import { activateAccount, backend, createAccount, loginApi, uniqueName, VALID_PASSWORD } from "./backend";
import { activeUser, answerQuestion, createTextQuestion, uploadQuestionImage, type ActiveUser } from "./student-data";
import { validExplanation, world } from "./world";

export async function namedStudent(firstName: string, lastName: string): Promise<ActiveUser> {
  const account = await createAccount("ogrenci", "ogrenci", { firstName, lastName });
  await activateAccount(account);
  const login = await loginApi(account.userName, VALID_PASSWORD);
  if (!login) throw new Error("Giriş başarısız.");
  return { ...account, password: VALID_PASSWORD, token: login.token };
}

let pool: Promise<ActiveUser[]> | null = null;

export function answerPool(): Promise<ActiveUser[]> {
  if (!pool) {
    pool = (async () => {
      const students: ActiveUser[] = [];
      for (let index = 0; index < 5; index += 1) students.push(await activeUser("ogrenci", "havuz"));
      return students;
    })();
  }
  return pool;
}

export async function wrongAnsweredQuestion(creator: ActiveUser, lessonId: number, students: ActiveUser[] | null, label = "Çözüm bekleyen soru") {
  const w = await world();
  const text = `${label} ${uniqueName("q")}: Hangisi doğrudur?`;
  const question = await createTextQuestion(creator, lessonId, text, 2);
  for (const student of students ?? (await answerPool())) {
    await answerQuestion(student, question.id, 3, validExplanation(w.settings.aciklamaMinKarakter));
  }
  return { ...question, text };
}

export async function reportQuestion(student: ActiveUser, questionId: number, reason: string, description: string) {
  const send = () => backend("POST", `/api/questions/${questionId}/reports`, { token: student.token, body: { reason, description } });
  let result = await send();
  for (let attempt = 0; attempt < 5 && result.status === 429; attempt += 1) {
    const wait = Number(result.headers.get("retry-after") ?? "6");
    await new Promise((resolve) => setTimeout(resolve, (Number.isFinite(wait) ? wait : 6) * 1000 + 500));
    result = await send();
  }
  if (result.status !== 201) throw new Error(`Şikâyet oluşmadı: ${result.status} ${JSON.stringify(result.body)}`);
}

export async function needsSolutionIds(token: string, lessonId?: number): Promise<number[]> {
  const query = lessonId ? `&lessonId=${lessonId}` : "";
  const result = await backend<{ items: { id: number }[] }>("GET", `/api/questions/needs-solution?pageSize=50${query}`, { token });
  if (result.status !== 200) throw new Error(`Liste alınamadı: ${result.status}`);
  return result.body.items.map((item) => item.id);
}

export async function studentQuestion(student: ActiveUser, lessonId: number, description: string): Promise<number> {
  const fileId = await uploadQuestionImage(student);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const result = await backend<{ id: number }>("POST", "/api/questions", {
      token: student.token,
      body: {
        lessonId,
        topicId: null,
        text: null,
        imageFileId: fileId,
        optionA: null,
        optionB: null,
        optionC: null,
        optionD: null,
        correctOption: 2,
        description,
        scheduledPublishDate: null,
      },
    });
    if (result.status === 201) return result.body.id;
    if (result.status !== 429) throw new Error(`Soru yüklenemedi: ${result.status} ${JSON.stringify(result.body)}`);
    await new Promise((resolve) => setTimeout(resolve, 6500));
  }
  throw new Error("Soru yüklenemedi: istek sınırı.");
}
