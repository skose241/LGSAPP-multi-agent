import type { Metadata } from "next";
import { NotificationsPage } from "@/features/student/notifications-page";

export const metadata: Metadata = { title: "Bildirimler" };

export default function NotificationsRoute() {
  return <NotificationsPage />;
}
