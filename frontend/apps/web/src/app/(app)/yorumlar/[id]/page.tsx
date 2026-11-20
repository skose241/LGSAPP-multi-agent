import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CommentThreadPage } from "@/features/student/comment-thread-page";

export const metadata: Metadata = { title: "Yorum Dizisi" };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CommentThreadRoute({ params }: PageProps) {
  const { id } = await params;
  if (!/^[0-9]+$/.test(id)) notFound();
  return <CommentThreadPage id={Number(id)} />;
}
