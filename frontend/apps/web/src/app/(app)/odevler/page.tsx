import type { Metadata } from "next";
import { Suspense } from "react";
import { StudentAssignmentsPage } from "@/features/student/assignments-page";
import { StudentOnly } from "@/features/student/student-only";

export const metadata: Metadata = { title: "Ödevlerim" };

export default function AssignmentsRoute() {
  return (
    <Suspense>
      <StudentOnly>
        <StudentAssignmentsPage />
      </StudentOnly>
    </Suspense>
  );
}
