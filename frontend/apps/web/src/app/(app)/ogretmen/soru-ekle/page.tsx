import type { Metadata } from "next";
import { Suspense } from "react";
import { PoolAddPage } from "@/features/teacher/pool-add-page";

export const metadata: Metadata = { title: "Havuza Soru Ekle" };

export default function PoolAddRoute() {
  return (
    <Suspense>
      <PoolAddPage />
    </Suspense>
  );
}
