import { describe, expect, it } from "vitest";
import { navFor, pageTitleFor } from "./nav";

const hrefs = (role: string) => navFor(role).items.map((entry) => entry.href);

describe("menü", () => {
  it("müdür öğrenciler, ödevler ve soru havuzunu görür", () => {
    expect(hrefs("mudur")).toEqual(expect.arrayContaining(["/ogretmen/ogrenciler", "/ogretmen/odevler", "/sorular"]));
  });

  it("öğretmen soru havuzunu görür", () => {
    expect(hrefs("ogretmen")).toContain("/sorular");
  });

  it("öğrenci menüsü değişmez", () => {
    expect(hrefs("ogrenci")).not.toContain("/ogretmen/ogrenciler");
    expect(navFor("ogrenci").items.find((entry) => entry.href === "/sorular")?.label).toBe("Soru Çöz");
  });

  it("öğe kimlikleri rol içinde benzersizdir", () => {
    for (const role of ["mudur", "ogretmen", "ogrenci"]) {
      const ids = navFor(role).items.map((entry) => entry.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("başlık role göre seçilir", () => {
    expect(pageTitleFor("/sorular", "ogrenci")).toBe("Soru Çöz");
    expect(pageTitleFor("/sorular", "mudur")).toBe("Soru Havuzu");
    expect(pageTitleFor("/sorular", "ogretmen")).toBe("Soru Havuzu");
    expect(pageTitleFor("/ogretmen/odevler", "mudur")).toBe("Ödevler");
  });
});
