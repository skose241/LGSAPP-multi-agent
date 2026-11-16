import type { Metadata } from "next";
import { Suspense } from "react";
import { QuestionsPage } from "@/features/student/questions-page";

export const metadata: Metadata = { title: "Soru Çöz" };

export default function QuestionsRoute() {
  return (
    <Suspense>
      <QuestionsPage />
    </Suspense>
  );
}
