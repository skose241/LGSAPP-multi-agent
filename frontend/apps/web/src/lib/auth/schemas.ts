import "@/lib/zod-config";
import { z } from "zod";

export const MIN_PASSWORD_LENGTH = { mudur: 12, default: 8 } as const;

export function minPasswordLength(role: string | undefined): number {
  return role === "mudur" ? MIN_PASSWORD_LENGTH.mudur : MIN_PASSWORD_LENGTH.default;
}

export function passwordRuleErrors(password: string, minLength: number): string[] {
  const errors: string[] = [];
  if (password.length < minLength) errors.push(`En az ${minLength} karakter olmalı.`);
  if (!/\d/u.test(password)) errors.push("En az bir rakam içermeli.");
  if (!/\p{Lu}/u.test(password)) errors.push("En az bir büyük harf içermeli.");
  if (!/\p{Ll}/u.test(password)) errors.push("En az bir küçük harf içermeli.");
  return errors;
}

export const loginSchema = z.object({
  userName: z.string().trim().min(1, "Kullanıcı adı zorunlu.").max(100, "Kullanıcı adı çok uzun."),
  password: z.string().min(1, "Şifre zorunlu.").max(128, "Şifre çok uzun."),
});
export type LoginValues = z.infer<typeof loginSchema>;

export function newPasswordSchema(minLength: number) {
  return z
    .string()
    .max(128, "Şifre en fazla 128 karakter olabilir.")
    .superRefine((value, ctx) => {
      const errors = passwordRuleErrors(value, minLength);
      if (errors.length > 0) ctx.addIssue({ code: "custom", message: errors[0] ?? "Şifre kurallara uymuyor." });
    });
}

export function changePasswordSchema(minLength: number) {
  return z
    .object({
      currentPassword: z.string().min(1, "Mevcut şifre zorunlu.").max(128),
      newPassword: newPasswordSchema(minLength),
      confirmPassword: z.string().min(1, "Yeni şifreyi tekrar yaz."),
    })
    .refine((v) => v.newPassword === v.confirmPassword, {
      path: ["confirmPassword"],
      message: "Şifreler eşleşmiyor.",
    })
    .refine((v) => v.currentPassword !== v.newPassword, {
      path: ["newPassword"],
      message: "Yeni şifre mevcut şifreden farklı olmalı.",
    });
}
export type ChangePasswordValues = z.infer<ReturnType<typeof changePasswordSchema>>;

export const forgotSchema = z.object({
  userName: z.string().trim().min(1, "Kullanıcı adı zorunlu.").max(100, "Kullanıcı adı çok uzun."),
});

export const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function maskRecoveryCode(input: string): string {
  const cleaned = input
    .toUpperCase()
    .split("")
    .filter((char) => RECOVERY_ALPHABET.includes(char))
    .slice(0, 12)
    .join("");
  return cleaned.replace(/(.{4})(?=.)/g, "$1-");
}

export const recoverSchema = z.object({
  userName: z.string().trim().min(1, "Kullanıcı adı zorunlu.").max(100, "Kullanıcı adı çok uzun."),
  recoveryCode: z.string().regex(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/u, "Kod XXXX-XXXX-XXXX biçiminde olmalı."),
  newPassword: newPasswordSchema(MIN_PASSWORD_LENGTH.mudur),
});

export const regenerateSchema = z.object({
  currentPassword: z.string().min(1, "Mevcut şifre zorunlu.").max(128),
});

export { safeNextPath } from "@/lib/safe-path";
