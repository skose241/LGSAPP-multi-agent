"use client";

import { meStatsQuery } from "@lgs/api/queries";
import { useQuery } from "@tanstack/react-query";
import { CloudOff } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api/client";

function percent(rate: number | null): string {
  return rate === null ? "-" : `%${Math.round(rate)}`;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-display text-2xl font-bold">{value}</dd>
    </div>
  );
}

function SuccessBar({ name, answered, correct, wrong, rate }: { name: string; answered: number; correct: number; wrong: number; rate: number | null }) {
  const correctWidth = answered === 0 ? 0 : (correct / answered) * 100;
  const wrongWidth = answered === 0 ? 0 : (wrong / answered) * 100;
  return (
    <li className="flex flex-col gap-1.5" data-testid="lesson-bar">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold">{name}</span>
        <span className="text-sm text-muted-foreground">
          {correct} doğru · {wrong} yanlış · Başarı {percent(rate)}
        </span>
      </div>
      <div
        role="img"
        aria-label={`${name}: ${answered} sorudan ${correct} doğru, ${wrong} yanlış`}
        className="flex h-3 overflow-hidden rounded-pill bg-surface-muted"
      >
        <div className="h-full bg-correct" style={{ width: `${correctWidth}%` }} />
        <div className="h-full bg-wrong" style={{ width: `${wrongWidth}%` }} />
      </div>
    </li>
  );
}

export function ProfileStats() {
  const stats = useQuery(meStatsQuery(api()));

  if (stats.isPending) {
    return <div role="status" aria-label="İstatistikler yükleniyor" className="h-48 animate-pulse rounded-lg bg-surface-muted" />;
  }

  if (stats.isError) {
    return (
      <EmptyState
        icon={CloudOff}
        as="h2"
        title="İstatistikler yüklenemedi"
        description={stats.error.message}
        action={<Button onClick={() => stats.refetch()}>Tekrar Dene</Button>}
      />
    );
  }

  const data = stats.data;
  const assignments = data.assignments;
  const participation = [
    { label: "Tamamlanan", value: assignments.completed },
    { label: "Kısmen yapılan", value: assignments.partial },
    { label: "Kaçırılan", value: assignments.missed },
    { label: "Başlanmamış", value: assignments.notStarted },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="profile-stats">
      <Card>
        <CardHeader>
          <CardTitle as="h2">Genel başarı</CardTitle>
          <CardDescription>Çözdüğün tüm sorular</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Çözülen" value={data.totals.answered} />
            <Stat label="Doğru" value={data.totals.correct} />
            <Stat label="Yanlış" value={data.totals.wrong} />
            <Stat label="Başarı" value={percent(data.totals.successRate)} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">Puan ve sıra</CardTitle>
          <CardDescription>Katkılarınla kazandığın puanlar</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-3 gap-4">
            <Stat label="Toplam puan" value={data.points.total} />
            <Stat label="Haftalık sıra" value={data.points.weekly.rank ? `${data.points.weekly.rank}.` : "-"} />
            <Stat label="Aylık sıra" value={data.points.monthly.rank ? `${data.points.monthly.rank}.` : "-"} />
            <Stat label="Haftalık puan" value={data.points.weekly.points} />
            <Stat label="Aylık puan" value={data.points.monthly.points} />
          </dl>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle as="h2">Ders bazında başarı</CardTitle>
          <CardDescription>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3 rounded-sm bg-correct" aria-hidden="true" /> Doğru
            </span>
            <span className="ml-4 inline-flex items-center gap-1.5">
              <span className="size-3 rounded-sm bg-wrong" aria-hidden="true" /> Yanlış
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.lessons.length === 0 ? (
            <p className="text-sm text-muted-foreground">Henüz soru çözmedin. İlk sorunu çözünce burada görünecek.</p>
          ) : (
            <ul className="flex flex-col gap-4" aria-label="Ders başarıları">
              {data.lessons.map((lesson) => (
                <SuccessBar key={lesson.lesson.id} name={lesson.lesson.name} answered={lesson.answered} correct={lesson.correct} wrong={lesson.wrong} rate={lesson.successRate} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">Ödev katılımı</CardTitle>
          <CardDescription>Toplam {assignments.assigned} ödev verildi</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4">
            {participation.map((item) => (
              <Stat key={item.label} label={item.label} value={item.value} />
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">Katkılarım</CardTitle>
          <CardDescription>Arkadaşlarına yaptığın katkılar</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4">
            <Stat label="Yüklenen soru" value={data.contributions.questionsUploaded} />
            <Stat label="Yazılan çözüm" value={data.contributions.solutionsWritten} />
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
