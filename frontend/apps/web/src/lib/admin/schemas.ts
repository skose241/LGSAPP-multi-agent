import { z } from "zod";

export const USER_NAME_PATTERN = /^[A-Za-z0-9._\-çğıöşüÇĞİÖŞÜ]+$/u;

export const createUserSchema = z
  .object({
    role: z.enum(["ogretmen", "ogrenci", "mudur"]),
    userName: z
      .string()
      .trim()
      .min(3, "Kullanıcı adı en az 3 karakter olmalı.")
      .max(50, "Kullanıcı adı en fazla 50 karakter olabilir.")
      .regex(USER_NAME_PATTERN, "Yalnızca harf (Türkçe harfler dahil), rakam, '.', '_' ve '-' kullanılabilir."),
    firstName: z.string().trim().min(1, "Ad zorunlu.").max(100, "Ad en fazla 100 karakter olabilir."),
    lastName: z.string().trim().min(1, "Soyad zorunlu.").max(100, "Soyad en fazla 100 karakter olabilir."),
    className: z.string().trim().max(50, "Sınıf en fazla 50 karakter olabilir."),
    branchLessonId: z.string(),
    confirmMudur: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (value.role === "mudur" && !value.confirmMudur) {
      ctx.addIssue({ code: "custom", path: ["confirmMudur"], message: "Devam etmek için onay vermelisin." });
    }
  });

export type CreateUserValues = z.infer<typeof createUserSchema>;

export function toCreateBody(values: CreateUserValues) {
  return {
    userName: values.userName.trim(),
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    role: values.role,
    className: values.role === "ogrenci" && values.className.trim() ? values.className.trim() : null,
    branchLessonId: values.role === "ogretmen" && values.branchLessonId ? Number(values.branchLessonId) : null,
  };
}
