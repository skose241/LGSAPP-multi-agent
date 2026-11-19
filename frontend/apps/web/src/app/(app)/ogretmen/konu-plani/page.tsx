import type { Metadata } from "next";
import { Suspense } from "react";
import { TopicPlanPage } from "@/features/teacher/topic-plan-page";

export const metadata: Metadata = { title: "Konu Planı" };

export default function TopicPlanRoute() {
  return (
    <Suspense>
      <TopicPlanPage />
    </Suspense>
  );
}
