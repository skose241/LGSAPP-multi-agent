"use client";

import { formatDateOnly } from "@lgs/api";
import { leaderboardQuery } from "@lgs/api/queries";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, CloudOff, Trophy } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { LeaderboardRow } from "@/components/leaderboard-row";
import { Button } from "@/components/ui/button";
import { useMe } from "@/features/auth/use-me";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";

type Period = "weekly" | "monthly";

export function LeaderboardPage() {
  const me = useMe();
  const [period, setPeriod] = useState<Period>("weekly");
  const [offset, setOffset] = useState(0);
  const board = useQuery(leaderboardQuery(api(), period, offset));
  const data = board.data;
  const myId = me.data?.id;
  const inList = data?.items.some((item) => item.userId === myId) ?? false;

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div>
        <h1 className="text-3xl">Liderlik</h1>
        <p className="text-muted-foreground">Soru çözerek, çözüm anlatarak ve katkı yaparak puan kazan.</p>
      </div>

      <div role="group" aria-label="Dönem" className="flex gap-2">
        {([
          { id: "weekly", label: "Haftalık" },
          { id: "monthly", label: "Aylık" },
        ] as const).map((tab) => (
          <button
            key={tab.id}
            type="button"
            aria-pressed={period === tab.id}
            onClick={() => {
              setPeriod(tab.id);
              setOffset(0);
            }}
            className={cn(
              "inline-flex min-h-touch items-center rounded-pill border px-5 text-sm font-semibold",
              period === tab.id ? "border-primary bg-primary text-primary-foreground" : "border-border-strong bg-surface hover:bg-surface-muted",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="secondary" size="icon" aria-label="Önceki dönem" onClick={() => setOffset((value) => value + 1)}>
          <ChevronLeft aria-hidden="true" />
        </Button>
        <p className="text-center text-sm font-semibold" data-testid="period-range">
          {data ? `${formatDateOnly(data.startDate)} – ${formatDateOnly(data.endDate)}` : "Yükleniyor"}
          {offset === 0 ? " (bu dönem)" : ""}
        </p>
        <Button type="button" variant="secondary" size="icon" aria-label="Sonraki dönem" disabled={offset === 0} onClick={() => setOffset((value) => Math.max(0, value - 1))}>
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>

      {data?.me ? (
        <div role="status" className="flex items-center justify-between rounded-lg border border-primary bg-primary-soft p-4" data-testid="my-rank">
          <span className="font-semibold text-primary-soft-foreground">Sıran</span>
          <span className="font-display text-xl font-bold text-primary-soft-foreground">
            {data.me.rank}. · {data.me.points} puan
          </span>
        </div>
      ) : null}

      {board.isPending ? (
        <div role="status" aria-label="Liderlik yükleniyor" className="grid gap-2">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="h-16 animate-pulse rounded-md bg-surface-muted" />
          ))}
        </div>
      ) : board.isError ? (
        <EmptyState
          icon={CloudOff}
          as="h2"
          title="Liderlik yüklenemedi"
          description={board.error.message}
          action={<Button onClick={() => board.refetch()}>Tekrar Dene</Button>}
        />
      ) : data && data.items.length === 0 ? (
        <EmptyState icon={Trophy} as="h2" title="Bu dönemde puan yok" description="İlk puanı kazanan sen ol." />
      ) : data ? (
        <>
          <ol className="flex flex-col gap-2" aria-label="Sıralama">
            {data.items.map((item) => (
              <LeaderboardRow
                key={item.userId}
                rank={item.rank}
                name={item.fullName || item.userName}
                detail={`@${item.userName}`}
                points={item.points}
                isMe={item.userId === myId}
              />
            ))}
          </ol>
          {data.me && !inList ? (
            <p className="text-center text-sm text-muted-foreground">
              İlk {data.items.length} içinde değilsin, sıran {data.me.rank}.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
