import type { Metadata } from "next";
import { AiAdminPage } from "@/features/admin/ai-admin-page";

export const metadata: Metadata = { title: "Yapay zekâ" };

export default function AiAdminRoute() {
  return <AiAdminPage />;
}
