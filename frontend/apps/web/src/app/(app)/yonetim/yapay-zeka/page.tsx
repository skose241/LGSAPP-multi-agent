import type { Metadata } from "next";
import { AiAdminPage } from "@/features/admin/ai-admin-page";

export const metadata: Metadata = { title: "Yapay Zekâ" };

export default function AiAdminRoute() {
  return <AiAdminPage />;
}
