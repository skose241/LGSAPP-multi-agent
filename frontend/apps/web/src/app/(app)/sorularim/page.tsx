import type { Metadata } from "next";
import { Suspense } from "react";
import { MyQuestionsPage } from "@/features/student/my-questions-page";

export const metadata: Metadata = { title: "Sorularım" };

export default function MyQuestionsRoute() {
  return (
    <Suspense>
      <MyQuestionsPage />
    </Suspense>
  );
}
