import type { Metadata } from "next";
import { Suspense } from "react";
import { StudentsListPage } from "@/features/teacher/students-list-page";

export const metadata: Metadata = { title: "Öğrenciler" };

export default function StudentsRoute() {
  return (
    <Suspense>
      <StudentsListPage />
    </Suspense>
  );
}
