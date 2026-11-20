import type { Metadata } from "next";
import { DisputedListPage } from "@/features/teacher/disputed-list-page";

export const metadata: Metadata = { title: "Şüpheli Anahtarlar" };

export default function DisputedRoute() {
  return <DisputedListPage />;
}
