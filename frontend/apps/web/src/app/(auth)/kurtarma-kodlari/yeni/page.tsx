import type { Metadata } from "next";
import { NewRecoveryCodes } from "@/features/auth/new-recovery-codes";

export const metadata: Metadata = { title: "Kurtarma kodların" };

export default function NewRecoveryCodesPage() {
  return <NewRecoveryCodes />;
}
