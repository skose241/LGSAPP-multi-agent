import type { Metadata } from "next";
import { ResetRequests } from "@/features/admin/reset-requests";

export const metadata: Metadata = { title: "Şifre talepleri" };

export default function ResetRequestsPage() {
  return <ResetRequests />;
}
