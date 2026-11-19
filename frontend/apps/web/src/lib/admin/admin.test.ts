import type { AdminUser } from "@lgs/api/queries";
import { describe, expect, it } from "vitest";
import { createUserSchema, toCreateBody } from "./schemas";
import { countByRole, filterUsers, matchesQuery, userActions } from "./users";

function user(overrides: Partial<AdminUser>): AdminUser {
  return {
    id: 1,
    userName: "ahmet.kaya",
    firstName: "Ahmet",
    lastName: "Kaya",
    className: "8-A",
    role: "ogrenci",
    isBanned: false,
    mustChangePassword: false,
    createdAt: "2026-11-14T10:00:00Z",
    lastLoginAt: null,
    createdByUserId: null,
    isSystemAccount: false,
    branchLessonId: null,
    branchLessonName: null,
    bannedAt: null,
    bannedBy: null,
    pendingReportCount: 0,
    ...overrides,
  };
}

describe("arama", () => {
  it("Türkçe büyük-küçük harfi doğru eşler", () => {
    const row = user({ firstName: "Işık", lastName: "İnce", userName: "isik.ince" });
    expect(matchesQuery(row, "ışık")).toBe(true);
    expect(matchesQuery(row, "IŞIK")).toBe(true);
    expect(matchesQuery(row, "İNCE")).toBe(true);
    expect(matchesQuery(row, "ince")).toBe(true);
  });

  it("aksansız yazımı da bulur", () => {
    expect(matchesQuery(user({ firstName: "Şükrü", userName: "sukru" }), "sukru")).toBe(true);
    expect(matchesQuery(user({ firstName: "Çağan" }), "cagan")).toBe(true);
  });

  it("kullanıcı adı ve sınıfta arar", () => {
    expect(matchesQuery(user({}), "ahmet.k")).toBe(true);
    expect(matchesQuery(user({}), "8-a")).toBe(true);
    expect(matchesQuery(user({}), "yok")).toBe(false);
    expect(matchesQuery(user({}), "   ")).toBe(true);
  });

  it("role göre süzer ve Türkçe sıralar", () => {
    const rows = [
      user({ id: 1, firstName: "Zeynep", lastName: "Ak", userName: "z" }),
      user({ id: 2, firstName: "Çağan", lastName: "Bal", userName: "c" }),
      user({ id: 3, firstName: "Ali", lastName: "Can", userName: "a", role: "ogretmen" }),
    ];
    expect(filterUsers(rows, "ogrenci", "").map((r) => r.id)).toEqual([2, 1]);
    expect(filterUsers(rows, "all", "").map((r) => r.id)).toEqual([3, 2, 1]);
    expect(countByRole(rows)).toEqual({ all: 3, ogretmen: 1, ogrenci: 2, mudur: 0 });
  });
});

describe("işlem kısıtları", () => {
  it("öğrencide tüm işlemler uygun, branş hariç", () => {
    const actions = userActions(user({}), 99);
    expect(actions.ban.allowed).toBe(true);
    expect(actions.regeneratePassword.allowed).toBe(true);
    expect(actions.branch.allowed).toBe(false);
  });

  it("öğretmende branş açıktır", () => {
    expect(userActions(user({ role: "ogretmen" }), 99).branch.allowed).toBe(true);
  });

  it("müdür banlanamaz ve şifresi yenilenemez, nedeni gösterilir", () => {
    const actions = userActions(user({ role: "mudur", id: 5 }), 99);
    expect(actions.ban).toEqual({ allowed: false, reason: "Müdür hesapları banlanamaz." });
    expect(actions.regeneratePassword.allowed).toBe(false);
    expect(actions.regeneratePassword.reason).toContain("Müdür hesaplarının");
  });

  it("kendi hesabında tehlikeli işlem yoktur", () => {
    const actions = userActions(user({ role: "mudur", id: 7 }), 7);
    expect(actions.ban.allowed).toBe(false);
    expect(actions.regeneratePassword.allowed).toBe(false);
  });

  it("sistem hesabında hiçbir işlem yoktur", () => {
    const actions = userActions(user({ role: "ai", isSystemAccount: true }), 99);
    expect(Object.values(actions).every((a) => !a.allowed)).toBe(true);
  });

  it("banlı hesapta engeli kaldırma açıktır", () => {
    const actions = userActions(user({ isBanned: true }), 99);
    expect(actions.unban.allowed).toBe(true);
    expect(actions.ban.allowed).toBe(false);
  });
});

describe("yeni kullanıcı şeması", () => {
  const base = {
    role: "ogrenci" as const,
    userName: "yeni.ogrenci",
    firstName: "Yeni",
    lastName: "Öğrenci",
    className: "",
    branchLessonId: "",
    confirmMudur: false,
  };

  it("geçerli değeri kabul eder", () => {
    expect(createUserSchema.safeParse(base).success).toBe(true);
    expect(createUserSchema.safeParse({ ...base, userName: "şükrü_1" }).success).toBe(true);
  });

  it("geçersiz kullanıcı adını reddeder", () => {
    expect(createUserSchema.safeParse({ ...base, userName: "ab" }).success).toBe(false);
    expect(createUserSchema.safeParse({ ...base, userName: "a b c" }).success).toBe(false);
    expect(createUserSchema.safeParse({ ...base, userName: "<img>" }).success).toBe(false);
  });

  it("müdür için onay ister", () => {
    expect(createUserSchema.safeParse({ ...base, role: "mudur" }).success).toBe(false);
    expect(createUserSchema.safeParse({ ...base, role: "mudur", confirmMudur: true }).success).toBe(true);
  });

  it("gövdeyi role göre kurar", () => {
    expect(toCreateBody({ ...base, className: " 8-B " }).className).toBe("8-B");
    expect(toCreateBody({ ...base, role: "ogretmen", className: "8-B", branchLessonId: "3" })).toMatchObject({
      className: null,
      branchLessonId: 3,
    });
    expect(toCreateBody({ ...base, branchLessonId: "3" }).branchLessonId).toBeNull();
  });
});
