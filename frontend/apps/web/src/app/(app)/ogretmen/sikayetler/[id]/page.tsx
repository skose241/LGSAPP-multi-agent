import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReportDetailPage } from "@/features/teacher/report-detail-page";

export const metadata: Metadata = { title: "Şikâyet İncelemesi" };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ReportDetailRoute({ params }: PageProps) {
  const { id } = await params;
  if (!/^[0-9]+$/.test(id)) notFound();
  return <ReportDetailPage id={Number(id)} />;
}
