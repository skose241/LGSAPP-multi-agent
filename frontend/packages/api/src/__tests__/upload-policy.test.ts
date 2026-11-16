import { describe, expect, it } from "vitest";
import { classifyFailure, formatBytes, generateClientUploadId, retryDelayMs, uploadProgress } from "../upload/policy";

const problem = (detail: string, extra: Record<string, unknown> = {}) => ({ title: "Hata", detail, ...extra });

describe("hata sınıflandırma", () => {
  it("ağ ve zaman aşımı yeniden denenir", () => {
    expect(classifyFailure({ status: 0, body: null, transport: "network" })).toMatchObject({ kind: "network", retryable: true, manualRetry: true });
    expect(classifyFailure({ status: 0, body: null, transport: "timeout" })).toMatchObject({ kind: "timeout", retryable: true });
  });

  it("5xx ve 408 yeniden denenir", () => {
    for (const status of [500, 502, 503, 504, 408]) {
      expect(classifyFailure({ status, body: null })).toMatchObject({ kind: "server", retryable: true });
    }
  });

  it("Retry-After'lı 429 yeniden denenir ve saniyeyi taşır", () => {
    const result = classifyFailure({ status: 429, body: problem("Lütfen bekleyin."), retryAfterHeader: "7" });
    expect(result).toMatchObject({ kind: "rateLimit", retryable: true, retryAfterSeconds: 7 });
  });

  it("Retry-After'sız 429 günlük kota sayılır ve tekrar denenmez", () => {
    const result = classifyFailure({ status: 429, body: problem("Günlük dosya yükleme sınırına ulaştınız.") });
    expect(result).toMatchObject({ kind: "quota", retryable: false, manualRetry: false });
    expect(result.message).toBe("Günlük dosya yükleme sınırına ulaştınız.");
  });

  it("çok uzun Retry-After otomatik beklenmez", () => {
    const result = classifyFailure({ status: 429, body: problem("x"), retryAfterHeader: "600" });
    expect(result).toMatchObject({ retryable: false, manualRetry: true, retryAfterSeconds: 600 });
    expect(result.message).toContain("600 saniye");
  });

  it("400 doğrulama hatası tekrar denenmez ve backend mesajını gösterir", () => {
    const result = classifyFailure({ status: 400, body: problem("Bir veya daha fazla doğrulama hatası oluştu.", { errors: { file: ["Fotoğraf okunamadı veya bozuk."] } }) });
    expect(result).toMatchObject({ kind: "validation", retryable: false, manualRetry: false, message: "Fotoğraf okunamadı veya bozuk." });
  });

  it("HEIC mesajı ayrı sınıflanır", () => {
    const result = classifyFailure({ status: 400, body: problem("x", { errors: { file: ["HEIC biçimi desteklenmiyor. Uygulamayı güncelleyin veya fotoğrafı JPEG olarak kaydedin."] } }) });
    expect(result.kind).toBe("heic");
    expect(result.retryable).toBe(false);
  });

  it("413 boyut hatası tekrar denenmez", () => {
    const result = classifyFailure({ status: 413, body: problem("Dosya en fazla 10 MB olabilir.") });
    expect(result).toMatchObject({ kind: "tooLarge", retryable: false, message: "Dosya en fazla 10 MB olabilir." });
  });

  it("401 oturum yenilenmişse tekrar denenir, değilse denenmez", () => {
    expect(classifyFailure({ status: 401, body: null, sessionRefreshed: true })).toMatchObject({ kind: "auth", retryable: true });
    expect(classifyFailure({ status: 401, body: null })).toMatchObject({ kind: "auth", retryable: false });
  });

  it("409 çakışma (işleniyor) yeniden denenir", () => {
    expect(classifyFailure({ status: 409, body: problem("Fotoğraf hâlâ işleniyor.") })).toMatchObject({ kind: "conflict", retryable: true });
  });

  it("403 tekrar denenmez", () => {
    expect(classifyFailure({ status: 403, body: problem("Yetkiniz yok.") })).toMatchObject({ retryable: false });
  });
});

describe("yeniden deneme zamanlaması", () => {
  it("1, 3, 9 saniye sonra durur", () => {
    expect([0, 1, 2, 3].map((index) => retryDelayMs(index, null))).toEqual([1000, 3000, 9000, null]);
  });

  it("Retry-After varsa önceliklidir", () => {
    expect(retryDelayMs(0, 7)).toBe(7000);
    expect(retryDelayMs(2, 2)).toBe(2000);
  });

  it("Retry-After üst sınıra kırpılır", () => {
    expect(retryDelayMs(0, 500, undefined, 120_000)).toBe(120_000);
  });

  it("Retry-After 0 en az 1 sn bekletir", () => {
    expect(retryDelayMs(1, 0)).toBe(1000);
  });

  it("Retry-After olsa da deneme sayısı tükenince durur", () => {
    expect([0, 1, 2, 3, 4].map((index) => retryDelayMs(index, 2))).toEqual([2000, 2000, 2000, null, null]);
    expect(retryDelayMs(3, 0)).toBeNull();
  });

  it("özel gecikme listesini kullanır", () => {
    expect(retryDelayMs(1, null, [10, 20])).toBe(20);
    expect(retryDelayMs(2, null, [10, 20])).toBeNull();
  });
});

describe("yükleme kimliği", () => {
  it("v4 biçimindedir", () => {
    const id = generateClientUploadId((bytes) => {
      bytes.fill(255);
      return bytes;
    });
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("varsayılan rastgele kaynakla benzersizdir", () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateClientUploadId()));
    expect(ids.size).toBe(50);
  });
});

describe("boyut ve ilerleme", () => {
  it("bayt biçimlendirir", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1536)).toBe("1,5 KB");
    expect(formatBytes(10 * 1024 * 1024)).toBe("10 MB");
    expect(formatBytes(-1)).toBe("");
  });

  it("ilerleme yanıt gelene kadar %99'u geçmez", () => {
    expect(uploadProgress(50, 100)).toBe(0.5);
    expect(uploadProgress(100, 100)).toBe(0.99);
    expect(uploadProgress(1, 0)).toBe(0);
  });
});
