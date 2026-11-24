import { describe, expect, it } from "vitest";
import { CROP_MAX_PIXELS, planCrop } from "./crop-plan";

describe("planCrop", () => {
  it("vektör kaynakta uzun kenarı 2000 pikselde tutar", () => {
    const plan = planCrop(250, 100);
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.width).toBe(2000);
      expect(plan.height).toBe(800);
    }
  });

  it("küçük kırpımı uzun kenar 2000 olacak şekilde büyütür", () => {
    const plan = planCrop(10, 10);
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.width).toBe(2000);
  });

  it("maxScale ile rastersel kaynakta büyütmeyi reddeder", () => {
    const small = planCrop(300, 150, { maxScale: 1 });
    expect(small.ok).toBe(false);
    if (!small.ok) expect(small.reason).toBe("tooSmall");
    expect(planCrop(1000, 600, { maxScale: 1 })).toMatchObject({ ok: true, width: 1000, height: 600 });
    expect(planCrop(4000, 3000, { maxScale: 1 })).toMatchObject({ ok: true, width: 2000, height: 1500 });
  });

  it("çok ince kırpımı reddeder", () => {
    const plan = planCrop(2000, 5);
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.reason).toBe("tooThin");
  });

  it("geçersiz boyutu reddeder ve kanvas 16 MP'yi aşmaz", () => {
    expect(planCrop(0, 100).ok).toBe(false);
    for (const [w, h] of [
      [100, 100],
      [500, 300],
      [3000, 2900],
    ] as const) {
      const plan = planCrop(w, h);
      if (plan.ok) expect(plan.width * plan.height).toBeLessThanOrEqual(CROP_MAX_PIXELS);
    }
  });
});
