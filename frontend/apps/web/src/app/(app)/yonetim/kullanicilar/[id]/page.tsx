import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { UserDetail } from "@/features/admin/user-detail";

export const metadata: Metadata = { title: "Kullanıcı Detayı" };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function UserDetailPage({ params }: PageProps) {
  const { id } = await params;
  if (!/^[0-9]+$/.test(id)) notFound();
  return <UserDetail id={Number(id)} />;
}
