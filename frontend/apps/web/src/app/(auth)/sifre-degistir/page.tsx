import type { Metadata } from "next";
import { ForcedPasswordChange } from "@/features/auth/forced-password-change";

export const metadata: Metadata = { title: "Şifre Değiştir" };

export default function ChangePasswordPage() {
  return <ForcedPasswordChange />;
}
