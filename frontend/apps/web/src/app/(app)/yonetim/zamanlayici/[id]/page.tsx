import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RunDetail } from "@/features/admin/run-detail";

export const metadata: Metadata = { title: "Çalıştırma Detayı" };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function RunDetailRoute({ params }: PageProps) {
  const { id } = await params;
  if (!/^[0-9]{1,9}$/.test(id) || Number(id) === 0) notFound();
  return <RunDetail id={Number(id)} />;
}
