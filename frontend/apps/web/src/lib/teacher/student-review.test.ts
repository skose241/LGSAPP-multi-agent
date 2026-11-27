import { describe, expect, it } from "vitest";
import { explanationShare, parseProfileView, profileViewToSearch } from "./student-review";

describe("öğrenci profili görünümü", () => {
  it("varsayılan sekme istatistiktir ve adres boş kalır", () => {
    expect(parseProfileView(new URLSearchParams(""))).toEqual({ tab: "stats", page: 1 });
    expect(profileViewToSearch({ tab: "stats", page: 4 })).toBe("");
  });

  it("sekme, ders ve sayfayı adresten okur", () => {
    expect(parseProfileView(new URLSearchParams("sekme=cevaplar&ders=3&sayfa=2"))).toEqual({ tab: "answers", page: 2, lessonId: 3 });
    expect(parseProfileView(new URLSearchParams("sekme=sorular&ders=3&sayfa=2"))).toEqual({ tab: "uploads", page: 2, lessonId: undefined });
  });

  it("geçersiz değerleri yok sayar", () => {
    expect(parseProfileView(new URLSearchParams("sekme=x&sayfa=-1"))).toEqual({ tab: "stats", page: 1 });
    expect(parseProfileView(new URLSearchParams("sekme=cevaplar&sayfa=abc&ders=0"))).toEqual({ tab: "answers", page: 1, lessonId: undefined });
  });

  it("adrese yazıp geri okuyunca aynı görünümü verir", () => {
    const view = { tab: "answers" as const, page: 3, lessonId: 5 };
    expect(parseProfileView(new URLSearchParams(profileViewToSearch(view)))).toEqual(view);
    expect(profileViewToSearch({ tab: "uploads", page: 1 })).toBe("?sekme=sorular");
  });

  it("açıklama oranını yuvarlar", () => {
    expect(explanationShare(1, 3)).toBe(33);
    expect(explanationShare(0, 0)).toBeNull();
  });
});
