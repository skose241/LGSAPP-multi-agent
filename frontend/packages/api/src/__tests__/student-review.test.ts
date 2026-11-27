import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "../client";
import { studentAnswersQuery, studentUploadsQuery, teacherKeys } from "../queries/teacher";

function fakeClient() {
  const get = vi.fn().mockResolvedValue({ data: { items: [] }, response: new Response(null, { status: 200 }) });
  return { client: { GET: get } as unknown as ApiClient, get };
}

describe("öğrenci inceleme sorguları", () => {
  it("yüklenen soruları sayfa bilgisiyle ister", async () => {
    const { client, get } = fakeClient();
    const options = studentUploadsQuery(client, 5, { page: 2, pageSize: 12 });
    await (options.queryFn as () => Promise<unknown>)();
    expect(get).toHaveBeenCalledWith("/api/students/{id}/questions", { params: { path: { id: 5 }, query: { page: 2, pageSize: 12 } } });
    expect(options.queryKey).toEqual(teacherKeys.studentUploads(5, { page: 2, pageSize: 12 }));
  });

  it("cevapları ders süzgeciyle ister", async () => {
    const { client, get } = fakeClient();
    const options = studentAnswersQuery(client, 5, { lessonId: 3, page: 1, pageSize: 20 });
    await (options.queryFn as () => Promise<unknown>)();
    expect(get).toHaveBeenCalledWith("/api/students/{id}/answers", { params: { path: { id: 5 }, query: { lessonId: 3, page: 1, pageSize: 20 } } });
  });

  it("anahtarlar öğrenci, sayfa ve süzgece göre ayrışır", () => {
    expect(teacherKeys.studentAnswers(5, { page: 1, pageSize: 20 })).not.toEqual(teacherKeys.studentAnswers(6, { page: 1, pageSize: 20 }));
    expect(teacherKeys.studentAnswers(5, { lessonId: 1, page: 1, pageSize: 20 })).not.toEqual(teacherKeys.studentAnswers(5, { page: 1, pageSize: 20 }));
    expect(teacherKeys.studentUploads(5, { page: 1, pageSize: 12 })[0]).toBe("teacher");
  });
});
