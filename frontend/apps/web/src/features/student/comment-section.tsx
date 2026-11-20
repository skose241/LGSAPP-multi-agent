"use client";

import { commentsInfiniteQuery, type CommentSort } from "@lgs/api/queries";
import { useInfiniteQuery } from "@tanstack/react-query";
import { CloudOff, MessageSquareDashed } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { CommentForm, CommentNode, type CommentContext } from "@/features/student/comment-node";
import { usePublicSettings } from "@/features/student/use-settings";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";

interface CommentSectionProps {
  questionId: number;
  solutionId: number | null;
  label: string;
}

export function CommentSection({ questionId, solutionId, label }: CommentSectionProps) {
  const [sort, setSort] = useState<CommentSort>("oldest");
  const settings = usePublicSettings();
  const query = useInfiniteQuery(commentsInfiniteQuery(api(), { questionId, solutionId, sort }));

  const first = query.data?.pages[0];
  const ctx: CommentContext = {
    questionId,
    solutionId,
    canComment: first?.canComment ?? false,
    maxLength: settings.data?.yorumMaxKarakter ?? 1000,
    reportMinLength: settings.data?.sikayetMinKarakter ?? 10,
  };
  const roots = query.data?.pages.flatMap((page) => page.items) ?? [];
  const scopeKey = solutionId ?? "soru";

  return (
    <section aria-label={label} className="flex flex-col gap-3" data-testid={`comments-${scopeKey}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg">
          {label}
          {first ? <span className="ml-2 text-sm font-normal text-muted-foreground">({first.totalCount})</span> : null}
        </h3>
        <div role="group" aria-label="Yorum sıralaması" className="flex gap-1.5">
          {(["oldest", "newest"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={sort === value}
              onClick={() => setSort(value)}
              className={cn(
                "inline-flex min-h-touch items-center rounded-pill border px-3 text-sm font-semibold",
                sort === value ? "border-primary bg-primary-soft text-primary-soft-foreground" : "border-border-strong bg-surface",
              )}
            >
              {value === "oldest" ? "Eskiden Yeniye" : "Yeniden Eskiye"}
            </button>
          ))}
        </div>
      </div>

      {ctx.canComment ? (
        <CommentForm ctx={ctx} parentId={null} draftKey={`yorum:${questionId}:${scopeKey}`} />
      ) : null}

      {query.isPending ? (
        <div role="status" aria-label="Yorumlar yükleniyor" className="h-24 animate-pulse rounded-md bg-surface-muted" />
      ) : query.isError ? (
        <EmptyState
          icon={CloudOff}
          as="h3"
          title="Yorumlar Yüklenemedi"
          description={query.error.message}
          action={<Button onClick={() => query.refetch()}>Tekrar Dene</Button>}
        />
      ) : roots.length === 0 ? (
        <EmptyState icon={MessageSquareDashed} as="h3" title="Henüz Yorum Yok" description="İlk yorumu siz yazın." />
      ) : (
        <ul className="flex flex-col gap-3" aria-label={`${label} listesi`}>
          {roots.map((comment) => (
            <CommentNode key={comment.id} comment={comment} ctx={ctx} />
          ))}
        </ul>
      )}

      {query.hasNextPage ? (
        <Button type="button" variant="secondary" className="self-center" loading={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>
          Daha Fazla Yorum
        </Button>
      ) : null}
    </section>
  );
}
