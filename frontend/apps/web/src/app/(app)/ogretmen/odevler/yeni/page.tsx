import type { Metadata } from "next";
import { AssignmentCreatePage } from "@/features/teacher/assignment-create-page";

export const metadata: Metadata = { title: "Yeni Ödev" };

export default function AssignmentCreateRoute() {
  return <AssignmentCreatePage />;
}
