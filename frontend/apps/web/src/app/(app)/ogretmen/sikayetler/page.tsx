import type { Metadata } from "next";
import { Suspense } from "react";
import { ReportsListPage } from "@/features/teacher/reports-list-page";

export const metadata: Metadata = { title: "Şikâyetler" };

export default function ReportsRoute() {
  return (
    <Suspense>
      <ReportsListPage />
    </Suspense>
  );
}
