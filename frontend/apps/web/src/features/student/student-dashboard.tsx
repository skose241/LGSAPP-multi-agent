"use client";

import { formatDateOnly } from "@lgs/api";
import { meStatsQuery, openAssignmentsQuery, questionKeys, questionsQuery, unreadCountQuery } from "@lgs/api/queries";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, ClipboardList, ImagePlus, Trophy } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PoolQuestionCard } from "@/features/student/pool-question-card";
import { api } from "@/lib/api/client";
import { scoredSentence } from "@/lib/student/upload-rules";

export function StudentDashboard() {
  const queryClient = useQueryClient();
  const assignments = useQuery(openAssignmentsQuery(api()));
  const stats = useQuery(meStatsQuery(api()));
  const unread = useQuery(unreadCountQuery(api()));
  const recent = useQuery(questionsQuery(api(), { answered: "all", since: 7, page: 1, pageSize: 6 }));

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-5">
        <section aria-label="Açık ödevler" className="flex flex-col gap-3">
          <h2 className="text-xl">Açık ödevler</h2>
          {assignments.isPending ? (
            <div role="status" aria-label="Ödevler yükleniyor" className="h-28 animate-pulse rounded-lg bg-surface-muted" />
          ) : assignments.isError ? (
            <p className="text-sm text-danger">Ödevler yüklenemedi.</p>
          ) : assignments.data.items.length === 0 ? (
            <EmptyState icon={ClipboardList} as="h3" title="Açık ödevin yok" description="Öğretmenin bir ödev verdiğinde burada görünecek." />
          ) : (
            <ul className="grid gap-3 md:grid-cols-2" aria-label="Açık ödev listesi">
              {assignments.data.items.map((item) => {
                const progress = item.totalQuestions === 0 ? 0 : Math.round((item.myAnsweredCount / item.totalQuestions) * 100);
                return (
                  <li key={item.id} data-testid="open-assignment">
                    <Card>
                      <CardHeader>
                        <CardTitle as="h3">{item.title}</CardTitle>
                        <p className="text-sm text-muted-foreground">
                          {item.lesson.name} · Son gün {formatDateOnly(item.endDate)}
                        </p>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-3">
                        <div
                          role="progressbar"
                          aria-label={`${item.title} ilerlemesi`}
                          aria-valuemin={0}
                          aria-valuemax={item.totalQuestions}
                          aria-valuenow={item.myAnsweredCount}
                          className="h-2.5 overflow-hidden rounded-pill bg-primary-100"
                        >
                          <div className="h-full rounded-pill bg-primary" style={{ width: `${progress}%` }} />
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {item.myAnsweredCount} / {item.totalQuestions} soru yapıldı, {item.myCorrectCount} doğru
                        </p>
                        <Button asChild variant="secondary" className="self-start">
                          <Link href={`/sorular?ders=${item.lesson.id}`}>Soruları çöz</Link>
                        </Button>
                      </CardContent>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-label="Son sorular" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xl">Son 7 günün soruları</h2>
            <Button asChild variant="ghost">
              <Link href="/sorular">Hepsini gör</Link>
            </Button>
          </div>
          {recent.isPending ? (
            <div role="status" aria-label="Sorular yükleniyor" className="h-48 animate-pulse rounded-lg bg-surface-muted" />
          ) : recent.isError ? (
            <p className="text-sm text-danger">Sorular yüklenemedi.</p>
          ) : recent.data.items.length === 0 ? (
            <EmptyState icon={ClipboardList} as="h3" title="Son günlerde yeni soru yok" description="Yeni sorular yayınlandığında burada görünecek." />
          ) : (
            <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3" aria-label="Son sorular listesi">
              {recent.data.items.map((item) => (
                <li key={item.id}>
                  <PoolQuestionCard item={item} onImageExpired={() => queryClient.invalidateQueries({ queryKey: questionKeys.all })} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="flex items-center gap-2">
              <ImagePlus className="size-5 text-primary" aria-hidden="true" />
              Soru yükle
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {stats.data ? (
              <p className="w-full text-sm" data-testid="dashboard-upload-quota">
                Bugün {stats.data.uploadToday.uploaded} / {stats.data.uploadToday.dailyLimit} soru yükledin, {stats.data.uploadToday.remaining} hakkın kaldı.
                {scoredSentence(stats.data.uploadToday) ? ` ${scoredSentence(stats.data.uploadToday)}` : ""}
              </p>
            ) : null}
            <Button asChild>
              <Link href="/soru-yukle">Soru yükle</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/sorularim">Sorularım</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle as="h2" className="flex items-center gap-2">
              <Trophy className="size-5 text-primary" aria-hidden="true" />
              Haftalık puan
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <dl className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-xs text-muted-foreground">Puan</dt>
                <dd className="font-display text-3xl font-bold" data-testid="weekly-points">
                  {stats.data?.points.weekly.points ?? "-"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Sıra</dt>
                <dd className="font-display text-3xl font-bold" data-testid="weekly-rank">
                  {stats.data?.points.weekly.rank ? `${stats.data.points.weekly.rank}.` : "-"}
                </dd>
              </div>
            </dl>
            <Button asChild variant="secondary" className="self-start">
              <Link href="/liderlik">Liderliğe bak</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle as="h2" className="flex items-center gap-2">
              <Bell className="size-5 text-primary" aria-hidden="true" />
              Bildirimler
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm" data-testid="unread-summary">
              {unread.data ? (unread.data.count > 0 ? `${unread.data.count} okunmamış bildirimin var.` : "Okunmamış bildirimin yok.") : "Yükleniyor"}
            </p>
            <Button asChild variant="secondary" className="self-start">
              <Link href="/bildirimler">Bildirimlere git</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
