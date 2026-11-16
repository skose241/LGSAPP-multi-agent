"use client";

import { commentThreadQuery } from "@lgs/api/queries";
import { isApiError } from "@lgs/api";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, CloudOff } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { CommentNode, type CommentContext } from "@/features/student/comment-node";
import { usePublicSettings } from "@/features/student/use-settings";
import { api } from "@/lib/api/client";

export function CommentThreadPage({ id }: { id: number }) {
  const thread = useQuery(commentThreadQuery(api(), id));
  const settings = usePublicSettings();

  if (thread.isPending) {
    return <div role="status" aria-label="Yorum yükleniyor" className="h-40 animate-pulse rounded-lg bg-surface-muted" />;
  }

  if (thread.isError) {
    const notFound = isApiError(thread.error) && (thread.error.status === 404 || thread.error.status === 403);
    return (
      <EmptyState
        icon={CloudOff}
        as="h2"
        title={notFound ? "Yorum bulunamadı" : "Yorum yüklenemedi"}
        description={notFound ? "Bu yoruma erişemiyorsun ya da silinmiş olabilir." : thread.error.message}
        action={
          <Button asChild variant="secondary">
            <Link href="/sorular">Sorulara dön</Link>
          </Button>
        }
      />
    );
  }

  const data = thread.data;
  const ctx: CommentContext = {
    questionId: data.questionId,
    solutionId: data.solutionId,
    canComment: data.focus.status === "active",
    maxLength: settings.data?.yorumMaxKarakter ?? 1000,
    reportMinLength: settings.data?.sikayetMinKarakter ?? 10,
  };

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <h1 className="text-3xl">Yorum dizisi</h1>
      <nav aria-label="Yorum zinciri">
        <ol className="flex flex-wrap items-center gap-1 text-sm">
          <li>
            <Link href={`/sorular/${data.questionId}`} className="inline-flex min-h-touch items-center font-semibold text-primary underline underline-offset-4">
              Soruya dön
            </Link>
          </li>
          {data.ancestors.map((ancestor) => (
            <li key={ancestor.id} className="flex items-center gap-1">
              <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
              <Link
                href={`/yorumlar/${ancestor.id}`}
                className="inline-flex min-h-touch max-w-48 items-center truncate text-primary underline underline-offset-4"
              >
                {ancestor.status === "active" ? (ancestor.userName ?? "Kullanıcı") : "[silindi]"}
              </Link>
            </li>
          ))}
          <li className="flex items-center gap-1" aria-current="page">
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
            <span className="font-semibold">Bu yorum</span>
          </li>
        </ol>
      </nav>
      <ul className="flex flex-col gap-3" aria-label="Yorum">
        <CommentNode comment={data.focus} ctx={ctx} />
      </ul>
    </div>
  );
}
