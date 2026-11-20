import { describe, expect, it, vi } from "vitest";
import {
  aiErrorKindLabel,
  aiOperationLabel,
  classifyAiRequestFailure,
  formatSuccessRate,
  formatUsd,
  orderSettings,
  quotaSummary,
  settingChanges,
  usageRange,
  validateSettingValue,
} from "../ai";
import { notificationHref } from "../enums";
import type { ApiClient } from "../client";
import { aiMutations } from "../queries/ai";

describe("AI istek hataları", () => {
  it("günlük limit mesajını geri sayımsız gösterir", () => {
    const result = classifyAiRequestFailure(429, "Bugünkü yapay zekâ çözüm hakkınız doldu. Yarın tekrar deneyebilirsiniz.", 40000);
    expect(result.kind).toBe("dailyLimit");
    expect(result.retryAfter).toBeNull();
  });

  it("genel limit mesajını günlük limit sayar", () => {
    expect(classifyAiRequestFailure(429, "Yapay zekâ bugün için yoğun. Lütfen yarın tekrar deneyin.", 30000).kind).toBe("dailyLimit");
  });

  it("dakikalık sınırı geri sayıma çevirir", () => {
    const result = classifyAiRequestFailure(429, "Lütfen bir süre bekleyip tekrar deneyin.", 25);
    expect(result).toMatchObject({ kind: "rateLimit", retryAfter: 25 });
  });

  it("Retry-After yoksa varsayılan bekleme uygular ve üst sınırı korur", () => {
    expect(classifyAiRequestFailure(429, "x", null).retryAfter).toBe(30);
    expect(classifyAiRequestFailure(503, "Sağlayıcı", 99999).retryAfter).toBe(600);
    expect(classifyAiRequestFailure(503, "Sağlayıcı", null).kind).toBe("providerDown");
  });

  it("diğer durum kodlarını sınıflar", () => {
    expect(classifyAiRequestFailure(422, "m", null).kind).toBe("unprocessable");
    expect(classifyAiRequestFailure(409, "m", null).kind).toBe("removed");
    expect(classifyAiRequestFailure(403, "m", null).kind).toBe("forbidden");
    expect(classifyAiRequestFailure(404, "m", null).kind).toBe("notFound");
    expect(classifyAiRequestFailure(0, "m", null).kind).toBe("network");
    expect(classifyAiRequestFailure(500, "m", null).kind).toBe("other");
  });
});

describe("kota özeti", () => {
  it("kalan hakkı gösterir", () => {
    expect(quotaSummary({ enabled: true, dailyLimit: 5, remainingToday: 3, usedToday: 2 })).toEqual({ canRequest: true, text: "Bugün Kalan Hakkınız: 3 / 5" });
  });

  it("hak bitince isteği kapatır", () => {
    expect(quotaSummary({ enabled: true, dailyLimit: 5, remainingToday: 0, usedToday: 5 }).canRequest).toBe(false);
  });

  it("kapalı özellikte isteği kapatır, moderatörde limit göstermez", () => {
    expect(quotaSummary({ enabled: false, dailyLimit: 5, remainingToday: 5, usedToday: 0 }).canRequest).toBe(false);
    const moderator = quotaSummary({ enabled: true, dailyLimit: null, remainingToday: null, usedToday: 1 });
    expect(moderator.canRequest).toBe(true);
    expect(moderator.text).toContain("Kişisel günlük limitiniz yok");
  });
});

describe("kullanım aralığı", () => {
  it("bugünü Türkiye saatine göre alır ve en fazla 92 gün döner", () => {
    const now = new Date("2026-11-16T22:30:00Z");
    expect(usageRange(7, now)).toEqual({ from: "2026-11-11", to: "2026-11-17" });
    const wide = usageRange(500, now);
    expect(wide.to).toBe("2026-11-17");
    expect(wide.from).toBe("2026-08-18");
    expect(usageRange(0, now).from).toBe("2026-11-17");
  });

  it("biçimleyiciler", () => {
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(0.0042)).toBe("$0.0042");
    expect(formatUsd(12.5)).toBe("$12.50");
    expect(formatSuccessRate(null)).toBe("-");
    expect(formatSuccessRate(0.875)).toBe("%88");
    expect(formatSuccessRate(80)).toBe("%80");
    expect(aiOperationLabel("solution")).toBe("Çözüm");
    expect(aiOperationLabel("yeniBirSey")).toBe("yeniBirSey");
    expect(aiErrorKindLabel("quotaExhausted")).toBe("Günlük Kota Doldu");
  });
});

describe("ayar düzenleme", () => {
  const meta = { key: "aiGunlukCozumLimit", min: 0, max: 50 };

  it("aralık ve tamsayı doğrular", () => {
    expect(validateSettingValue(meta, "5")).toBeNull();
    expect(validateSettingValue(meta, "51")).toBe("0 ile 50 arasında olmalıdır.");
    expect(validateSettingValue(meta, "-1")).toBe("0 ile 50 arasında olmalıdır.");
    expect(validateSettingValue(meta, "2.5")).toBe("Tam sayı girin.");
    expect(validateSettingValue(meta, "")).toBe("Tam sayı girin.");
  });

  it("yalnız değişenleri gönderir", () => {
    const current = [
      { key: "a", value: 5 },
      { key: "b", value: 1 },
      { key: "c", value: 7 },
    ];
    expect(settingChanges(current, { a: "5", b: "0", c: " 9 " })).toEqual({ b: 0, c: 9 });
    expect(settingChanges(current, {})).toEqual({});
  });

  it("ayarları sabit sıraya dizer", () => {
    const ordered = orderSettings([{ key: "soruCarpani" }, { key: "bilinmeyen" }, { key: "aiCozumAktifMi" }]);
    expect(ordered.map((item) => item.key)).toEqual(["aiCozumAktifMi", "soruCarpani", "bilinmeyen"]);
  });
});

describe("bildirim bağlantısı", () => {
  it("şüpheli anahtar bildirimini moderatörde inceleme ekranına götürür", () => {
    expect(notificationHref({ questionId: 9 }, { type: "answerDisputed", role: "ogretmen" })).toBe("/ogretmen/supheli-anahtarlar/9");
    expect(notificationHref({ questionId: 9 }, { type: "answerDisputed", role: "mudur" })).toBe("/ogretmen/supheli-anahtarlar/9");
    expect(notificationHref({ questionId: 9 }, { type: "answerDisputed", role: "ogrenci" })).toBe("/sorular/9");
    expect(notificationHref({ questionId: 9 }, { type: "commentReply", role: "ogretmen" })).toBe("/sorular/9");
  });
});

describe("AI mutasyonları", () => {
  it("ayarları düz sözlük olarak gönderir", async () => {
    const put = vi.fn().mockResolvedValue({ data: { changed: [], settings: [] }, response: new Response(null, { status: 200 }) });
    await aiMutations.updateSettings({ PUT: put } as unknown as ApiClient, { aiGunlukCozumLimit: 3 });
    expect(put.mock.calls[0]![1].body).toEqual({ aiGunlukCozumLimit: 3 });
  });

  it("şüpheyi kaldırırken rowVersion ve notu gönderir", async () => {
    const post = vi.fn().mockResolvedValue({ data: { questionId: 1 }, response: new Response(null, { status: 200 }) });
    await aiMutations.dismissDispute({ POST: post } as unknown as ApiClient, 4, "rv==", "Anahtar doğru");
    expect(post.mock.calls[0]![1]).toEqual({ params: { path: { id: 4 } }, body: { rowVersion: "rv==", note: "Anahtar doğru" } });
  });

  it("anahtarı değiştirirken şık, rowVersion ve notu gönderir", async () => {
    const put = vi.fn().mockResolvedValue({ data: {}, response: new Response(null, { status: 200 }) });
    await aiMutations.changeCorrectOption({ PUT: put } as unknown as ApiClient, 4, 3, "rv==", null);
    expect(put.mock.calls[0]![1].body).toEqual({ correctOption: 3, rowVersion: "rv==", note: null });
  });
});

describe("kullanım özeti", () => {
  it("gün bazında toplar ve tarihe göre sıralar", async () => {
    const { summarizeDays, usagePercent } = await import("../ai");
    const rows = [
      { date: "2026-11-16", calls: 2, succeeded: 1, failed: 1, rejected: 0, costUsd: 0.5 },
      { date: "2026-11-15", calls: 1, succeeded: 1, failed: 0, rejected: 0, costUsd: 0.25 },
      { date: "2026-11-16", calls: 3, succeeded: 2, failed: 0, rejected: 1, costUsd: 0.5 },
    ];
    expect(summarizeDays(rows)).toEqual([
      { date: "2026-11-15", calls: 1, succeeded: 1, failed: 0, rejected: 0, costUsd: 0.25 },
      { date: "2026-11-16", calls: 5, succeeded: 3, failed: 1, rejected: 1, costUsd: 1 },
    ]);
    expect(usagePercent(30, 150)).toBe(20);
    expect(usagePercent(200, 150)).toBe(100);
    expect(usagePercent(0, 0)).toBe(0);
    expect(usagePercent(3, 0)).toBe(100);
  });
});
