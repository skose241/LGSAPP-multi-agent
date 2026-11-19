import type { Metadata } from "next";
import { GenerationSchedulePage } from "@/features/admin/generation-schedule-page";

export const metadata: Metadata = { title: "Ders programı" };

export default function GenerationScheduleRoute() {
  return <GenerationSchedulePage />;
}
