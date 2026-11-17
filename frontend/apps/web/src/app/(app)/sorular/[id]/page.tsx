import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { QuestionDetail } from "@/features/student/question-detail";

export const metadata: Metadata = { title: "Soru" };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function QuestionRoute({ params }: PageProps) {
  const { id } = await params;
  if (!/^[0-9]+$/.test(id)) notFound();
  return (
    <Suspense>
      <QuestionDetail id={Number(id)} />
    </Suspense>
  );
}
