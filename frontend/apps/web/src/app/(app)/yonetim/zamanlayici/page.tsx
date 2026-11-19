import type { Metadata } from "next";
import { SchedulerPage } from "@/features/admin/scheduler-page";

export const metadata: Metadata = { title: "Zamanlayıcı" };

export default function SchedulerRoute() {
  return <SchedulerPage />;
}
