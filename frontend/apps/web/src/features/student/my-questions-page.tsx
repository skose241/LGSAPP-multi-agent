"use client";

import { formatDateTimeShort } from "@lgs/api";
import { myQuestionsQuery, questionKeys, type MyQuestion } from "@lgs/api/queries";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CloudOff, EyeOff, ImagePlus, ImageIcon, MessageSquare } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/pagination";
import { QuestionImage } from "@/components/question-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";

const PAGE_SIZE = 12;

function parsePage(value: string | null): number {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 && page <= 1000 ? page : 1;
}

function MyQuestionCard({ item, onImageExpired }: { item: MyQuestion; onImageExpired: () => void | Promise<unknown> }) {
  const content = (
    <>
      <span className="flex flex-wrap items-center gap-1.5">
        <Badge tone="primary">{item.lesson.name}</Badge>
        {item.topic ? <Badge tone="neutral">{item.topic.name}</Badge> : null}
        {item.isHidden ? (
          <Badge tone="warning" data-testid="my-question-status">
            <EyeOff aria-hidden="true" />
            Gizlendi
          </Badge>
        ) : (
          <Badge tone="success" data-testid="my-question-status">
            <CheckCircle2 aria-hidden="true" />
            Yayında
          </Badge>
        )}
      </span>

      {item.image ? (
        <QuestionImage image={item.image} alt={`${item.lesson.name} sorusu görseli`} variant="thumb" onExpired={onImageExpired} className="aspect-[4/3] object-cover" />
      ) : (
        <span className="flex aspect-[4/3] w-full items-center justify-center rounded-md border border-border bg-surface-muted text-muted-foreground">
          <ImageIcon className="size-8" aria-hidden="true" />
        </span>
      )}

      <span className="mt-auto flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <time dateTime={item.createdAt}>{formatDateTimeShort(item.createdAt)}</time>
        <span className="inline-flex items-center gap-1.5">
          <MessageSquare className="size-4" aria-hidden="true" />
          {item.answerCount} cevap, {item.correctCount} doğru
        </span>
      </span>
    </>
  );

  const classes = "flex h-full flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm";
  return (
    <Link href={`/sorular/${item.id}`} data-testid="my-question" data-question-id={item.id} className={`${classes} transition-colors hover:bg-surface-muted`}>
      {content}
    </Link>
  );
}

export function MyQuestionsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const page = parsePage(params.get("sayfa"));
  const questions = useQuery(myQuestionsQuery(api(), page, PAGE_SIZE));
  const data = questions.data;
  const pageCount = data ? Math.max(1, Math.ceil(data.totalCount / data.pageSize)) : 1;
  const slice = data
    ? {
        page: data.page,
        pageCount,
        from: data.totalCount === 0 ? 0 : (data.page - 1) * data.pageSize + 1,
        to: (data.page - 1) * data.pageSize + data.items.length,
        total: data.totalCount,
      }
    : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl">Sorularım</h1>
          <p className="text-muted-foreground">Yüklediğiniz soruları ve kaç kişinin çözdüğünü buradan takip edebilirsiniz.</p>
        </div>
        <Button asChild>
          <Link href="/soru-yukle">
            <ImagePlus aria-hidden="true" />
            Soru Yükle
          </Link>
        </Button>
      </div>

      {questions.isPending ? (
        <div role="status" aria-label="Sorular yükleniyor" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="h-72 animate-pulse rounded-lg bg-surface-muted" />
          ))}
        </div>
      ) : questions.isError ? (
        <EmptyState
          icon={CloudOff}
          as="h2"
          title="Sorular Yüklenemedi"
          description={questions.error.message}
          action={<Button onClick={() => questions.refetch()}>Tekrar Dene</Button>}
        />
      ) : data && data.items.length === 0 ? (
        <EmptyState
          icon={ImagePlus}
          as="h2"
          title="Henüz Soru Yüklemediniz"
          description="Çözemediğiniz bir sorunun fotoğrafını yükleyin, arkadaşlarınız çözsün."
          action={
            <Button asChild>
              <Link href="/soru-yukle">Soru Yükle</Link>
            </Button>
          }
        />
      ) : data ? (
        <>
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Yüklediğim sorular" aria-busy={questions.isPlaceholderData || undefined}>
            {data.items.map((item) => (
              <li key={item.id}>
                <MyQuestionCard item={item} onImageExpired={() => queryClient.invalidateQueries({ queryKey: questionKeys.all })} />
              </li>
            ))}
          </ul>
          {slice ? <Pagination slice={slice} onPageChange={(next) => router.push(next === 1 ? pathname : `${pathname}?sayfa=${next}`)} /> : null}
        </>
      ) : null}
    </div>
  );
}
