"use client";

import { questionSourceLabel } from "@lgs/api";
import type { QuestionPoolItem } from "@lgs/api/queries";
import { CheckCircle2, ImageIcon, MessageSquare, ThumbsUp, XCircle } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { MathText } from "@/components/math-text";
import { QuestionImage } from "@/components/question-image";
import { cn } from "@/lib/utils";

export function PoolQuestionCard({ item, onImageExpired }: { item: QuestionPoolItem; onImageExpired?: () => void | Promise<unknown> }) {
  const answered = item.myAnswer !== null;

  return (
    <Link
      href={`/sorular/${item.id}`}
      data-testid="pool-question"
      className="flex h-full flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm transition-colors hover:bg-surface-muted"
    >
      <span className="flex flex-wrap items-center gap-1.5">
        <Badge tone="primary">{item.lesson.name}</Badge>
        {item.topic ? <Badge tone="neutral">{item.topic.name}</Badge> : null}
        <Badge tone={item.source === "ai" ? "info" : item.source === "teacher" ? "accent" : "neutral"}>
          {questionSourceLabel(item.source)}
        </Badge>
        {item.isMine ? <Badge tone="success">Senin</Badge> : null}
      </span>

      {item.image ? (
        <QuestionImage image={item.image} alt={`${item.lesson.name} sorusu görseli`} variant="thumb" onExpired={onImageExpired} className="aspect-[4/3] object-cover" />
      ) : item.previewText ? null : (
        <span className="flex aspect-[4/3] w-full items-center justify-center rounded-md border border-border bg-surface-muted text-muted-foreground">
          <ImageIcon className="size-8" aria-hidden="true" />
        </span>
      )}

      {item.previewText ? <MathText text={item.previewText} compact className="line-clamp-4 max-w-prose overflow-hidden text-base" /> : null}

      <span className="mt-auto flex items-center justify-between gap-2 text-sm">
        {answered ? (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 font-semibold",
              item.myAnswer?.isCorrect ? "text-correct-soft-foreground" : "text-wrong-soft-foreground",
            )}
          >
            {item.myAnswer?.isCorrect ? <CheckCircle2 className="size-4" aria-hidden="true" /> : <XCircle className="size-4" aria-hidden="true" />}
            {item.myAnswer?.isCorrect ? "Doğru" : "Yanlış"}
            {item.correctOption ? ` · Doğru şık ${String.fromCharCode(64 + item.correctOption)}` : ""}
          </span>
        ) : (
          <span className="font-semibold text-primary-soft-foreground">Çöz</span>
        )}
        <span className="inline-flex items-center gap-3 text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <ThumbsUp className="size-4" aria-hidden="true" />
            <span className="sr-only">Beğeni</span>
            {item.likeCount}
          </span>
          {item.commentCount !== null ? (
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="size-4" aria-hidden="true" />
              <span className="sr-only">Yorum</span>
              {item.commentCount}
            </span>
          ) : null}
        </span>
      </span>
    </Link>
  );
}
