import { describe, expect, it } from "vitest";
import { decodeJwt, ROLE_CLAIM, secondsUntilExpiry } from "./jwt";
import { decideRoute } from "./route-guard";
import { maskRecoveryCode, minPasswordLength, passwordRuleErrors, safeNextPath, changePasswordSchema, recoverSchema } from "./auth/schemas";
import { adoptDraftOwner, clearAllDrafts, clearDraft, loadDraft, saveDraft } from "./session/draft";

function jwt(payload: Record<string, unknown>) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none" })}.${encode(payload)}.sig`;
}

describe("jwt", () => {
  it("rol, exp ve zorunlu şifre değişimini okur", () => {
    const info = decodeJwt(jwt({ [ROLE_CLAIM]: "mudur", exp: 2000, must_change_password: "true" }));
    expect(info).toEqual({ exp: 2000, roles: ["mudur"], mustChangePassword: true });
    expect(secondsUntilExpiry(info, new Date(1000 * 1000))).toBe(1000);
  });

  it("birden çok rolü ve geçersiz token'ı işler", () => {
    expect(decodeJwt(jwt({ [ROLE_CLAIM]: ["a", "b"] }))?.roles).toEqual(["a", "b"]);
    expect(decodeJwt("bozuk")).toBeNull();
    expect(decodeJwt(undefined)).toBeNull();
  });

  it("Türkçe karakterli yükü çözer", () => {
    expect(decodeJwt(jwt({ must_change_password: "false", ad: "Şişli" }))?.mustChangePassword).toBe(false);
  });
});

describe("route guard", () => {
  const student = { exp: 9e9, roles: ["ogrenci"], mustChangePassword: false };
  const base = { search: "", hasAccess: true, hasRefresh: true, info: student };

  it("çerezsiz korumalı sayfayı girişe yönlendirir", () => {
    expect(decideRoute({ ...base, pathname: "/profil", search: "?a=1", hasAccess: false, hasRefresh: false, info: null })).toEqual({
      type: "redirect",
      to: "/giris?next=%2Fprofil%3Fa%3D1",
    });
    expect(decideRoute({ ...base, pathname: "/", hasAccess: false, hasRefresh: false, info: null })).toEqual({ type: "redirect", to: "/giris" });
  });

  it("yalnız yenileme çerezi varsa sayfa geçer", () => {
    expect(decideRoute({ ...base, pathname: "/profil", hasAccess: false, info: null })).toEqual({ type: "next" });
  });

  it("zorunlu şifre değişiminde yalnız /sifre-degistir açılır", () => {
    const info = { ...student, mustChangePassword: true };
    expect(decideRoute({ ...base, pathname: "/", info })).toEqual({ type: "redirect", to: "/sifre-degistir" });
    expect(decideRoute({ ...base, pathname: "/sifre-degistir", info })).toEqual({ type: "next" });
    expect(decideRoute({ ...base, pathname: "/sifre-degistir" })).toEqual({ type: "redirect", to: "/" });
  });

  it("rol bazlı yolları ayırır", () => {
    expect(decideRoute({ ...base, pathname: "/yonetim/kullanicilar" })).toEqual({ type: "redirect", to: "/" });
    expect(decideRoute({ ...base, pathname: "/ogretmen/odevler" })).toEqual({ type: "redirect", to: "/" });
    expect(decideRoute({ ...base, pathname: "/ogretmen/odevler", info: { ...student, roles: ["ogretmen"] } })).toEqual({ type: "next" });
    expect(decideRoute({ ...base, pathname: "/yonetim/ayarlar", info: { ...student, roles: ["ogretmen"] } })).toEqual({ type: "redirect", to: "/" });
    expect(decideRoute({ ...base, pathname: "/yonetim/ayarlar", info: { ...student, roles: ["mudur"] } })).toEqual({ type: "next" });
    expect(decideRoute({ ...base, pathname: "/ogretmen/odevler", info: { ...student, roles: ["mudur"] } })).toEqual({ type: "next" });
  });

  it("girişli kullanıcıyı /giris yerine ana sayfaya alır, oturum nedeni hariç", () => {
    expect(decideRoute({ ...base, pathname: "/giris" })).toEqual({ type: "redirect", to: "/" });
    expect(decideRoute({ ...base, pathname: "/giris", search: "?neden=oturum" })).toEqual({ type: "next" });
  });
});

describe("şemalar", () => {
  it("şifre kuralları role göre uzunluk ister", () => {
    expect(minPasswordLength("mudur")).toBe(12);
    expect(minPasswordLength("ogrenci")).toBe(8);
    expect(passwordRuleErrors("abc", 8)).toHaveLength(3);
    expect(passwordRuleErrors("Abcdefg1", 8)).toEqual([]);
    expect(passwordRuleErrors("İyiŞifre1", 8)).toEqual([]);
  });

  it("şifre değiştirme eşleşme ve farklılık denetler", () => {
    const schema = changePasswordSchema(8);
    expect(schema.safeParse({ currentPassword: "Eski1234", newPassword: "Yeni1234", confirmPassword: "Yeni1234" }).success).toBe(true);
    expect(schema.safeParse({ currentPassword: "Eski1234", newPassword: "Yeni1234", confirmPassword: "Baska1234" }).success).toBe(false);
    expect(schema.safeParse({ currentPassword: "Eski1234", newPassword: "Eski1234", confirmPassword: "Eski1234" }).success).toBe(false);
  });

  it("kurtarma kodunu maskeler", () => {
    expect(maskRecoveryCode("abcd2345efgh")).toBe("ABCD-2345-EFGH");
    expect(maskRecoveryCode("ab-cd 0o1i")).toBe("ABCD");
    expect(maskRecoveryCode("ABCD2345EFGH999")).toBe("ABCD-2345-EFGH");
  });

  it("kurtarma formu kod biçimini ve müdür şifre uzunluğunu doğrular", () => {
    const ok = { userName: "mudur", recoveryCode: "ABCD-2345-EFGH", newPassword: "UzunSifre1234" };
    expect(recoverSchema.safeParse(ok).success).toBe(true);
    expect(recoverSchema.safeParse({ ...ok, recoveryCode: "ABCD" }).success).toBe(false);
    expect(recoverSchema.safeParse({ ...ok, newPassword: "Kisa1Sifre" }).success).toBe(false);
  });

  it("next yolunu güvenli yapar", () => {
    expect(safeNextPath("/profil")).toBe("/profil");
    expect(safeNextPath("//kotu.example")).toBe("/");
    expect(safeNextPath("https://kotu.example")).toBe("/");
    expect(safeNextPath("/giris")).toBe("/");
    expect(safeNextPath(null)).toBe("/");
  });
});

describe("taslak", () => {
  function memory() {
    const data = new Map<string, string>();
    return {
      get length() {
        return data.size;
      },
      key: (index: number) => Array.from(data.keys())[index] ?? null,
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
      removeItem: (key: string) => void data.delete(key),
    };
  }

  it("kaydeder, okur ve siler", () => {
    const storage = memory();
    expect(saveDraft("yorum:1", "merhaba", storage)).toBe(true);
    expect(loadDraft("yorum:1", storage)).toBe("merhaba");
    clearDraft("yorum:1", storage);
    expect(loadDraft("yorum:1", storage)).toBe("");
  });

  it("clearAllDrafts yalnızca taslak önekli kayıtları siler", () => {
    const storage = memory();
    saveDraft("cevap:1", "a", storage);
    saveDraft("yanit:2:3", "b", storage);
    storage.setItem("baska", "korunur");
    clearAllDrafts(storage);
    expect(loadDraft("cevap:1", storage)).toBe("");
    expect(loadDraft("yanit:2:3", storage)).toBe("");
    expect(storage.getItem("baska")).toBe("korunur");
  });

  it("farklı kullanıcı girince taslaklar silinir, aynı kullanıcıda korunur", () => {
    const storage = memory();
    adoptDraftOwner(1, storage);
    saveDraft("yorum:5:s", "birinci", storage);
    adoptDraftOwner(1, storage);
    expect(loadDraft("yorum:5:s", storage)).toBe("birinci");
    adoptDraftOwner(2, storage);
    expect(loadDraft("yorum:5:s", storage)).toBe("");
  });

  it("boş metin taslağı siler", () => {
    const storage = memory();
    saveDraft("a", "x", storage);
    saveDraft("a", "   ", storage);
    expect(loadDraft("a", storage)).toBe("");
  });

  it("depolama yoksa ya da hata verirse sessizce başarısız olur", () => {
    expect(saveDraft("a", "x", null)).toBe(false);
    expect(loadDraft("a", null)).toBe("");
    const broken = {
      getItem: () => {
        throw new Error("x");
      },
      setItem: () => {
        throw new Error("x");
      },
      removeItem: () => {
        throw new Error("x");
      },
    };
    expect(saveDraft("a", "x", broken)).toBe(false);
    expect(loadDraft("a", broken)).toBe("");
  });
});
