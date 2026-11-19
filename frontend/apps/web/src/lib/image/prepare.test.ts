import { PrepareError } from "@lgs/api";
import { describe, expect, it, vi } from "vitest";
import { ENCODE_LADDER, MAX_EDGE, fitWithin, isHeicLike, prepareImage, sniffHeicBrand, type Decoded, type ImageDeps } from "./prepare";

function fakeDeps(overrides: Partial<ImageDeps> & { size?: (width: number, quality: number) => number; dims?: [number, number] } = {}) {
  const [width, height] = overrides.dims ?? [4000, 3000];
  const decoded: Decoded = { width, height, handle: {} };
  const renders: { width: number; height: number; quality: number }[] = [];
  const deps: ImageDeps = {
    decodeNative: overrides.decodeNative ?? vi.fn(async () => decoded),
    decodeHeic: overrides.decodeHeic ?? vi.fn(async () => decoded),
    render:
      overrides.render ??
      (async (_decoded, w, h, quality) => {
        renders.push({ width: w, height: h, quality });
        const bytes = overrides.size ? overrides.size(w, quality) : 1000;
        return new Blob([new Uint8Array(bytes)], { type: "image/jpeg" });
      }),
    release: overrides.release ?? vi.fn(),
  };
  return { deps, renders, decoded };
}

function file(name: string, type: string, bytes: number[] = [1, 2, 3]) {
  return Object.assign(new Blob([new Uint8Array(bytes)], { type }), { name });
}

describe("boyut hesabı", () => {
  it("uzun kenarı 2000 pikselde sınırlar ve oranı korur", () => {
    expect(fitWithin(4000, 3000, 2000)).toEqual({ width: 2000, height: 1500 });
    expect(fitWithin(3000, 4000, 2000)).toEqual({ width: 1500, height: 2000 });
    expect(fitWithin(4032, 3024, 2000)).toEqual({ width: 2000, height: 1500 });
  });

  it("küçük görseli büyütmez", () => {
    expect(fitWithin(1200, 800, 2000)).toEqual({ width: 1200, height: 800 });
    expect(fitWithin(2000, 2000, 2000)).toEqual({ width: 2000, height: 2000 });
  });

  it("geçersiz boyutta sıfır döner", () => {
    expect(fitWithin(0, 100, 2000)).toEqual({ width: 0, height: 0 });
  });

  it("çok ince görselde kısa kenarı en az 1 yapar", () => {
    expect(fitWithin(20000, 1, 2000)).toEqual({ width: 2000, height: 1 });
  });
});

describe("boş çıktı koruması", () => {
  it("canvas boş blob üretirse bir kez daha dener ve gönderilecek dosya boş olmaz", async () => {
    let calls = 0;
    const { deps } = fakeDeps({
      render: async () => {
        calls += 1;
        return new Blob([new Uint8Array(calls === 1 ? 0 : 1000)], { type: "image/jpeg" });
      },
    });
    const result = await prepareImage(file("a.jpg", "image/jpeg"), deps);
    expect(result.blob.size).toBe(1000);
  });

  it("canvas sürekli boş blob üretirse encode hatası verir", async () => {
    const { deps } = fakeDeps({ render: async () => new Blob([], { type: "image/jpeg" }) });
    await expect(prepareImage(file("a.jpg", "image/jpeg"), deps)).rejects.toMatchObject({ kind: "encode" });
  });
});

describe("render hatası günlüğü", () => {
  it("yakalanan render hatasını önekle console.warn ile bildirir ve yeniden dener", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const failure = new Error("canvas");
    let calls = 0;
    const { deps } = fakeDeps({
      render: async () => {
        calls += 1;
        if (calls === 1) throw failure;
        return new Blob([new Uint8Array(1000)], { type: "image/jpeg" });
      },
    });
    const result = await prepareImage(file("a.jpg", "image/jpeg"), deps);
    expect(result.blob.size).toBe(1000);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("[image/prepare]"), failure);
    warn.mockRestore();
  });
});

describe("HEIC tespiti", () => {
  it("tür ve uzantıdan tanır", () => {
    expect(isHeicLike({ type: "image/heic", name: "a" })).toBe(true);
    expect(isHeicLike({ type: "image/HEIF", name: "a" })).toBe(true);
    expect(isHeicLike({ type: "", name: "IMG_0001.HEIC" })).toBe(true);
    expect(isHeicLike({ type: "image/jpeg", name: "a.jpg" })).toBe(false);
  });

  it("dosya başlığındaki ftyp markasından tanır", () => {
    const head = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]);
    expect(sniffHeicBrand(head)).toBe(true);
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(sniffHeicBrand(jpeg)).toBe(false);
    expect(sniffHeicBrand(new Uint8Array([1, 2]))).toBe(false);
  });
});

describe("görsel hazırlama", () => {
  it("normal fotoğrafı 2000 px ve 0.85 kaliteyle kodlar, belleği serbest bırakır", async () => {
    const { deps, renders, decoded } = fakeDeps();
    const result = await prepareImage(file("a.jpg", "image/jpeg"), deps);
    expect(result.width).toBe(2000);
    expect(result.height).toBe(1500);
    expect(renders[0]).toEqual({ width: 2000, height: 1500, quality: 0.85 });
    expect(result.previewBlob).toBeInstanceOf(Blob);
    expect(renders[1]!.width).toBe(480);
    expect(deps.decodeHeic).not.toHaveBeenCalled();
    expect(deps.release).toHaveBeenCalledWith(decoded);
  });

  it("HEIC dosyada doğrudan heic-to yolunu kullanır", async () => {
    const { deps } = fakeDeps();
    const result = await prepareImage(file("IMG_1.HEIC", "image/heic"), deps);
    expect(deps.decodeHeic).toHaveBeenCalledTimes(1);
    expect(deps.decodeNative).not.toHaveBeenCalled();
    expect(result.blob.type).toBe("image/jpeg");
  });

  it("türü boş ama başlığı HEIC olan dosyayı heic-to ile çözer", async () => {
    const { deps } = fakeDeps();
    const bytes = [0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x69, 0x66, 0x31, 0, 0, 0, 0];
    await prepareImage(file("blob", "", bytes), deps);
    expect(deps.decodeHeic).toHaveBeenCalledTimes(1);
  });

  it("yerel çözme başarısız olursa heic-to'ya düşer", async () => {
    const { deps } = fakeDeps({
      decodeNative: vi.fn(async () => {
        throw new Error("çözülemedi");
      }),
    });
    await prepareImage(file("a.jpg", "image/jpeg"), deps);
    expect(deps.decodeNative).toHaveBeenCalledTimes(1);
    expect(deps.decodeHeic).toHaveBeenCalledTimes(1);
  });

  it("ikisi de başarısız olursa okunamadı hatası verir", async () => {
    const boom = vi.fn(async () => {
      throw new Error("x");
    });
    const { deps } = fakeDeps({ decodeNative: boom, decodeHeic: boom });
    await expect(prepareImage(file("a.jpg", "image/jpeg"), deps)).rejects.toMatchObject({ name: "PrepareError", kind: "decode" });
  });

  it("HEIC dönüştürülemezse HEIC mesajı verir", async () => {
    const { deps } = fakeDeps({
      decodeHeic: vi.fn(async () => {
        throw new Error("x");
      }),
    });
    const error = await prepareImage(file("a.heic", "image/heic"), deps).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PrepareError);
    expect((error as PrepareError).kind).toBe("heic");
    expect((error as PrepareError).message).toContain("JPEG");
  });

  it("çok küçük fotoğrafı reddeder ve belleği yine serbest bırakır", async () => {
    const { deps, decoded } = fakeDeps({ dims: [150, 900] });
    await expect(prepareImage(file("a.jpg", "image/jpeg"), deps)).rejects.toMatchObject({ kind: "tooSmall" });
    expect(deps.release).toHaveBeenCalledWith(decoded);
  });

  it("10 MB'ı aşarsa kalite ve boyut merdiveninde iner", async () => {
    const limit = 10 * 1024 * 1024;
    const { deps, renders } = fakeDeps({ size: (width, quality) => (quality >= 0.85 ? limit + 5 : width >= 2000 ? limit : 1000) });
    const result = await prepareImage(file("a.jpg", "image/jpeg"), deps);
    expect(renders.slice(0, 3).map((step) => step.quality)).toEqual([0.85, 0.7, 0.7]);
    expect(renders[2]!.width).toBe(1600);
    expect(result.width).toBe(1600);
  });

  it("hiçbir basamak yetmezse tooLarge verir", async () => {
    const { deps, renders } = fakeDeps({ size: () => 11 * 1024 * 1024 });
    await expect(prepareImage(file("a.jpg", "image/jpeg"), deps)).rejects.toMatchObject({ kind: "tooLarge" });
    expect(renders).toHaveLength(ENCODE_LADDER.length);
  });

  it("kodlama hatasını encode olarak bildirir", async () => {
    const { deps } = fakeDeps({
      render: async () => {
        throw new Error("canvas");
      },
    });
    await expect(prepareImage(file("a.jpg", "image/jpeg"), deps)).rejects.toMatchObject({ kind: "encode" });
  });

  it("önizleme üretilemese de ana görseli döndürür", async () => {
    let calls = 0;
    const { deps } = fakeDeps({
      render: async () => {
        calls += 1;
        if (calls > 1) throw new Error("önizleme");
        return new Blob([new Uint8Array(500)]);
      },
    });
    const result = await prepareImage(file("a.jpg", "image/jpeg"), deps);
    expect(result.previewBlob).toBeNull();
    expect(result.blob.size).toBe(500);
  });

  it("iptal edilmişse hiçbir şey çözmez", async () => {
    const controller = new AbortController();
    controller.abort();
    const { deps } = fakeDeps();
    await expect(prepareImage(file("a.jpg", "image/jpeg"), deps, { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(deps.decodeNative).not.toHaveBeenCalled();
  });

  it("yüksek sabitler beklenen değerlerde", () => {
    expect(MAX_EDGE).toBe(2000);
  });
});
