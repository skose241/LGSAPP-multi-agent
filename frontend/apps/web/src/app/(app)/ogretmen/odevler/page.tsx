import type { Metadata } from "next";
import { Suspense } from "react";
import { AssignmentsListPage } from "@/features/teacher/assignments-list-page";

export const metadata: Metadata = { title: "Ödev Yönetimi" };

export default function AssignmentsManageRoute() {
  return (
    <Suspense>
      <AssignmentsListPage />
    </Suspense>
  );
}
