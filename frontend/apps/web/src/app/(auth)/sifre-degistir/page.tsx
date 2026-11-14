import type { Metadata } from "next";
import { ForcedPasswordChange } from "@/features/auth/forced-password-change";

export const metadata: Metadata = { title: "Şifre değiştir" };

export default function ChangePasswordPage() {
  return <ForcedPasswordChange />;
}
