import type { Metadata } from "next";
import { Suspense } from "react";
import { NeedsSolutionPage } from "@/features/teacher/needs-solution-page";

export const metadata: Metadata = { title: "Çözüm Bekleyenler" };

export default function NeedsSolutionRoute() {
  return (
    <Suspense>
      <NeedsSolutionPage />
    </Suspense>
  );
}
