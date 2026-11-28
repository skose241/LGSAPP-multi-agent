import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "../client";
import { dailyQuestionsQuery, questionKeys, questionsQuery } from "../queries/questions";

describe("questionsQuery", () => {
  const base = { answered: "all", page: 1, pageSize: 12 } as const;

  it("yönetici süzgeçlerini anahtara katar", () => {
    expect(questionKeys.list({ ...base, scheduled: true })).not.toEqual(questionKeys.list(base));
    expect(questionKeys.list({ ...base, authorId: 3 })).not.toEqual(questionKeys.list({ ...base, authorId: 4 }));
    expect(questionKeys.list({ ...base, includeHidden: true })).not.toEqual(questionKeys.list(base));
  });

  it("süzgeçleri istek sorgusuna aktarır, kapalı bayrakları göndermez", async () => {
    const get = vi.fn().mockResolvedValue({ data: { items: [] }, response: { ok: true } });
    const client = { GET: get } as unknown as ApiClient;
    const options = questionsQuery(client, { ...base, scheduled: true, includeHidden: false, authorId: 7 });
    await (options.queryFn as () => Promise<unknown>)();
    const query = get.mock.calls[0]?.[1].params.query;
    expect(query).toMatchObject({ scheduled: true, authorId: 7, page: 1, pageSize: 12 });
    expect(query.includeHidden).toBeUndefined();
  });
});

describe("dailyQuestionsQuery", () => {
  it("anahtarı questionKeys.all altında tutar", () => {
    const client = { GET: vi.fn() } as unknown as ApiClient;
    const key = dailyQuestionsQuery(client).queryKey;
    expect(key.slice(0, questionKeys.all.length)).toEqual([...questionKeys.all]);
    expect(key).not.toEqual(questionKeys.list({ answered: "all", page: 1, pageSize: 12 }));
  });

  it("günlük uç noktayı sorgusuz çağırır ve yanıtı döner", async () => {
    const payload = { date: "2026-11-26", items: [] };
    const get = vi.fn().mockResolvedValue({ data: payload, response: { ok: true } });
    const client = { GET: get } as unknown as ApiClient;
    const result = await (dailyQuestionsQuery(client).queryFn as () => Promise<unknown>)();
    expect(get).toHaveBeenCalledWith("/api/questions/daily");
    expect(result).toEqual(payload);
  });
});
