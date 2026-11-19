import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StudentAssignmentDetailPage } from "@/features/student/assignment-detail-page";
import { StudentOnly } from "@/features/student/student-only";

export const metadata: Metadata = { title: "Ödev" };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AssignmentRoute({ params }: PageProps) {
  const { id } = await params;
  if (!/^[0-9]+$/.test(id)) notFound();
  return (
    <StudentOnly>
      <StudentAssignmentDetailPage id={Number(id)} />
    </StudentOnly>
  );
}
