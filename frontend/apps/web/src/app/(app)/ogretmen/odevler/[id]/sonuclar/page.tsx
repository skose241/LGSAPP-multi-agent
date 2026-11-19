import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AssignmentResultsPage } from "@/features/teacher/assignment-results-page";

export const metadata: Metadata = { title: "Ödev Sonuçları" };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AssignmentResultsRoute({ params }: PageProps) {
  const { id } = await params;
  if (!/^[0-9]+$/.test(id)) notFound();
  return (
    <Suspense>
      <AssignmentResultsPage id={Number(id)} />
    </Suspense>
  );
}
