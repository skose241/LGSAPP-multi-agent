import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AssignmentEditPage } from "@/features/teacher/assignment-edit-page";

export const metadata: Metadata = { title: "Ödev" };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AssignmentEditRoute({ params }: PageProps) {
  const { id } = await params;
  if (!/^[0-9]+$/.test(id)) notFound();
  return <AssignmentEditPage id={Number(id)} />;
}
