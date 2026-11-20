import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StudentProfilePage } from "@/features/teacher/student-profile-page";

export const metadata: Metadata = { title: "Öğrenci Profili" };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function StudentProfileRoute({ params }: PageProps) {
  const { id } = await params;
  if (!/^[0-9]+$/.test(id)) notFound();
  return <StudentProfilePage id={Number(id)} />;
}
