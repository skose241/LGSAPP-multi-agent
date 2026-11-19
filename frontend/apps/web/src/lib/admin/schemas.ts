import "@/lib/zod-config";
import { z } from "zod";

export const USER_NAME_PATTERN = /^[A-Za-z0-9._\-çğıöşüÇĞİÖŞÜ]+$/u;

export const userNameSchema = z
  .string()
  .trim()
  .min(3, "Kullanıcı adı en az 3 karakter olmalı.")
  .max(50, "Kullanıcı adı en fazla 50 karakter olabilir.")
  .regex(USER_NAME_PATTERN, "Yalnızca harf (Türkçe harfler dahil), rakam, '.', '_' ve '-' kullanılabilir.");

export const firstNameSchema = z.string().trim().min(1, "Ad zorunlu.").max(100, "Ad en fazla 100 karakter olabilir.");
export const lastNameSchema = z.string().trim().min(1, "Soyad zorunlu.").max(100, "Soyad en fazla 100 karakter olabilir.");
export const classNameSchema = z.string().trim().max(50, "Sınıf en fazla 50 karakter olabilir.");

export const updateUserSchema = z.object({
  firstName: firstNameSchema,
  lastName: lastNameSchema,
  className: classNameSchema,
});

export type UpdateUserValues = z.infer<typeof updateUserSchema>;

export function toUpdateBody(values: UpdateUserValues, isStudent: boolean) {
  const className = values.className.trim();
  return {
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    className: isStudent && className ? className : null,
  };
}

export const createUserSchema = z
  .object({
    role: z.enum(["ogretmen", "ogrenci", "mudur"]),
    userName: userNameSchema,
    firstName: firstNameSchema,
    lastName: lastNameSchema,
    className: classNameSchema,
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
