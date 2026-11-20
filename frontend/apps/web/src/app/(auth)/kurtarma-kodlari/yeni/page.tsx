import type { Metadata } from "next";
import { NewRecoveryCodes } from "@/features/auth/new-recovery-codes";

export const metadata: Metadata = { title: "Kurtarma Kodlarınız" };

export default function NewRecoveryCodesPage() {
  return <NewRecoveryCodes />;
}
