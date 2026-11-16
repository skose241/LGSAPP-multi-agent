import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DisputeReviewPage } from "@/features/teacher/dispute-review-page";

export const metadata: Metadata = { title: "Cevap anahtarı incelemesi" };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DisputeReviewRoute({ params }: PageProps) {
  const { id } = await params;
  if (!/^[0-9]+$/.test(id)) notFound();
  return <DisputeReviewPage id={Number(id)} />;
}
