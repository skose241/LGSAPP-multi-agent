import zlib from "node:zlib";
import { activateAccount, apiUrl, backend, createAccount, loginApi, randomIp, VALID_PASSWORD, type CreatedAccount } from "./backend";

export interface ActiveUser extends CreatedAccount {
  password: string;
  token: string;
}

export async function activeUser(role: "ogrenci" | "ogretmen" | "mudur", prefix: string = role): Promise<ActiveUser> {
  const account = await createAccount(role, prefix);
  await activateAccount(account);
  const login = await loginApi(account.userName, VALID_PASSWORD);
  if (!login) throw new Error("Giriş başarısız.");
  return { ...account, password: VALID_PASSWORD, token: login.token };
}

export async function refreshToken(user: ActiveUser): Promise<string> {
  const login = await loginApi(user.userName, user.password);
  if (!login) throw new Error("Giriş başarısız.");
  return login.token;
}

interface LessonRef {
  id: number;
  name: string;
  topics: { id: number; name: string }[];
}

export async function lessonsFor(token: string): Promise<LessonRef[]> {
  const result = await backend<LessonRef[]>("GET", "/api/lessons", { token });
  if (result.status !== 200) throw new Error(`Dersler alınamadı: ${result.status}`);
  return result.body;
}

export async function publicSettings(token: string) {
  const result = await backend<{ aciklamaMinKarakter: number; cozumMaxKarakter: number; yorumMaxKarakter: number; yorumDuzenlemeDk: number; yorumGorunurDerinlik: number; sikayetMinKarakter: number; yorumMaxDerinlik: number }>(
    "GET",
    "/api/settings/public",
    { token },
  );
  return result.body;
}

export interface SeedQuestion {
  id: number;
  text: string;
  correctOption: number;
}

export async function createTextQuestion(
  teacher: ActiveUser,
  lessonId: number,
  text: string,
  correctOption = 2,
  extra: Record<string, unknown> = {},
): Promise<SeedQuestion> {
  const send = () => backend<{ id: number }>("POST", "/api/questions", {
    token: teacher.token,
    body: {
      lessonId,
      topicId: null,
      text,
      imageFileId: null,
      optionA: "Birinci",
      optionB: "İkinci",
      optionC: "Üçüncü",
      optionD: "Dördüncü",
      correctOption,
      description: null,
      scheduledPublishDate: null,
      ...extra,
    },
  });
  let result = await send();
  for (let attempt = 0; attempt < 6 && result.status === 429; attempt += 1) {
    const wait = Number(result.headers.get("retry-after") ?? "6");
    await new Promise((resolve) => setTimeout(resolve, (Number.isFinite(wait) ? wait : 6) * 1000 + 500));
    result = await send();
  }
  if (result.status !== 201) throw new Error(`Soru oluşturulamadı: ${result.status} ${JSON.stringify(result.body)}`);
  return { id: result.body.id, text, correctOption };
}

export async function answerQuestion(student: ActiveUser, questionId: number, option: number, text: string) {
  const result = await backend<{ isCorrect: boolean; pointsEarned: number; solutionId: number }>("POST", `/api/questions/${questionId}/answers`, {
    token: student.token,
    body: { selectedOption: option, solutionText: text, solutionImageFileId: null },
  });
  if (result.status !== 200) throw new Error(`Cevap verilemedi: ${result.status} ${JSON.stringify(result.body)}`);
  return result.body;
}

export const LONG_TEXT = "Bu soruyu önce şıkları eleyerek, sonra işlemleri adım adım yaparak çözdüm.";

export async function postComment(user: ActiveUser, questionId: number, body: string, parentId: number | null = null, solutionId: number | null = null) {
  const result = await backend<{ id: number; rowVersion: string | null }>("POST", `/api/questions/${questionId}/comments`, {
    token: user.token,
    body: { body, parentId, solutionId },
  });
  if (result.status !== 201) throw new Error(`Yorum yazılamadı: ${result.status} ${JSON.stringify(result.body)}`);
  return result.body;
}

export async function editCommentApi(user: ActiveUser, id: number, body: string, rowVersion: string) {
  return backend("PATCH", `/api/comments/${id}`, { token: user.token, body: { body, rowVersion } });
}

export async function getComments(user: ActiveUser, questionId: number) {
  const result = await backend<{ items: { id: number; body: string | null; rowVersion: string | null }[] }>("GET", `/api/questions/${questionId}/comments?pageSize=50`, { token: user.token });
  return result.body.items;
}

export async function reportSolution(user: ActiveUser, solutionId: number, reason: string, description: string) {
  return backend("POST", `/api/solutions/${solutionId}/reports`, { token: user.token, body: { reason, description } });
}

export async function rejectPendingReports(teacher: ActiveUser, solutionId: number) {
  const list = await backend<{ items: { id: number; solutionId: number | null; rowVersion: string; status: string }[] }>("GET", "/api/admin/reports?status=pending&pageSize=50", { token: teacher.token });
  const targets = list.body.items.filter((item) => item.solutionId === solutionId);
  for (const report of targets) {
    const result = await backend("POST", `/api/admin/reports/${report.id}/resolve`, {
      token: teacher.token,
      body: { action: "reject", note: "Uygun bulunmadı.", correctOption: null, rowVersion: report.rowVersion },
    });
    if (result.status !== 200) throw new Error(`Şikâyet reddedilemedi: ${result.status} ${JSON.stringify(result.body)}`);
  }
  return targets.length;
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

export function makePng(width = 640, height = 480): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const row = Buffer.alloc(1 + width * 3);
  const raw = Buffer.alloc(row.length * height);
  for (let y = 0; y < height; y += 1) {
    const offset = y * row.length;
    for (let x = 0; x < width; x += 1) {
      raw[offset + 1 + x * 3] = (x * 255) / width;
      raw[offset + 2 + x * 3] = (y * 255) / height;
      raw[offset + 3 + x * 3] = 180;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export async function uploadQuestionImage(user: ActiveUser): Promise<number> {
  const form = new FormData();
  form.set("purpose", "questionImage");
  form.set("clientUploadId", crypto.randomUUID());
  form.set("file", new Blob([new Uint8Array(makePng())], { type: "image/png" }), "soru.png");
  const response = await fetch(`${apiUrl()}/api/files`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${user.token}`,
      "x-lgs-proxy-key": process.env.E2E_PROXY_KEY ?? "",
      "x-lgs-client-ip": randomIp(),
    },
    body: form,
  });
  const body = (await response.json()) as { id?: number };
  if (response.status !== 201 && response.status !== 200) throw new Error(`Yükleme başarısız: ${response.status} ${JSON.stringify(body)}`);
  return body.id ?? 0;
}

export async function createOpenAssignment(teacher: ActiveUser, lessonId: number, title: string, startDate: string, endDate: string) {
  const created = await backend<{ id: number; rowVersion: string }>("POST", "/api/assignments", {
    token: teacher.token,
    body: { lessonId, title, description: "Deneme ödevi", startDate, endDate },
  });
  if (created.status !== 201) throw new Error(`Ödev oluşturulamadı: ${created.status} ${JSON.stringify(created.body)}`);
  const added = await backend<{ items: { id: number; rowVersion: string }[] }>("POST", `/api/assignments/${created.body.id}/questions`, {
    token: teacher.token,
    body: {
      items: [
        { text: `${title} birinci soru`, imageFileId: null, optionA: "A1", optionB: "B1", optionC: "C1", optionD: "D1", correctOption: 2, topicId: null, description: null },
        { text: `${title} ikinci soru`, imageFileId: null, optionA: "A2", optionB: "B2", optionC: "C2", optionD: "D2", correctOption: 1, topicId: null, description: null },
      ],
    },
  });
  if (added.status !== 201) throw new Error(`Ödev sorusu eklenemedi: ${added.status} ${JSON.stringify(added.body)}`);
  const detail = await backend<{ rowVersion: string }>("GET", `/api/assignments/${created.body.id}/manage`, { token: teacher.token });
  const published = await backend("POST", `/api/assignments/${created.body.id}/publish`, {
    token: teacher.token,
    body: { rowVersion: detail.body.rowVersion },
  });
  if (published.status !== 200) throw new Error(`Ödev yayınlanamadı: ${published.status} ${JSON.stringify(published.body)}`);
  return created.body.id;
}
