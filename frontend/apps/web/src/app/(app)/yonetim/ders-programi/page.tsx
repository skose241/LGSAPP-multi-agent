import type { Metadata } from "next";
import { GenerationSchedulePage } from "@/features/admin/generation-schedule-page";

export const metadata: Metadata = { title: "Ders Programı" };

export default function GenerationScheduleRoute() {
  return <GenerationSchedulePage />;
}
