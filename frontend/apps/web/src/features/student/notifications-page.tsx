"use client";

import { formatDateTimeShort, notificationHref, notificationTypeLabel } from "@lgs/api";
import { notificationMutations, notificationsQuery, type NotificationItem } from "@lgs/api/queries";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellOff, CheckCheck, CloudOff } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMe } from "@/features/auth/use-me";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";

function NotificationRow({ item, role, onRead }: { item: NotificationItem; role: string | undefined; onRead: (id: number) => void }) {
  const href = notificationHref(item, { type: item.type, role });
  const body = (
    <span className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="flex flex-wrap items-center gap-2">
        <Badge tone={item.isRead ? "neutral" : "accent"}>{notificationTypeLabel(item.type)}</Badge>
        <span className="text-xs text-muted-foreground">{formatDateTimeShort(item.createdAt)}</span>
        {!item.isRead ? <span className="text-xs font-semibold text-accent-soft-foreground">Yeni</span> : null}
      </span>
      <span className="max-w-prose break-words text-base">{item.message}</span>
    </span>
  );

  return (
    <li
      data-testid="notification"
      data-read={item.isRead}
      className={cn("flex items-start gap-2 rounded-lg border p-3", item.isRead ? "border-border bg-surface" : "border-accent bg-accent-soft")}
    >
      {href ? (
        <Link href={href} onClick={() => (item.isRead ? undefined : onRead(item.id))} className="flex min-h-touch min-w-0 flex-1 items-start">
          {body}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-start">{body}</div>
      )}
      {!item.isRead ? (
        <Button type="button" variant="ghost" size="icon" aria-label="Okundu İşaretle" onClick={() => onRead(item.id)}>
          <CheckCheck aria-hidden="true" />
        </Button>
      ) : null}
    </li>
  );
}

export function NotificationsPage() {
  const queryClient = useQueryClient();
  const me = useMe();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const list = useQuery(notificationsQuery(api(), unreadOnly, page));

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["notifications"] });

  const readOne = useMutation({
    mutationFn: (id: number) => notificationMutations.read(api(), id),
    onSuccess: refresh,
  });
  const readAll = useMutation({
    mutationFn: () => notificationMutations.readAll(api()),
    onSuccess: async () => {
      toast.success("Tüm bildirimler okundu işaretlendi.");
      await refresh();
    },
  });

  const data = list.data;
  const slice = data
    ? {
        page: data.page,
        pageCount: Math.max(1, Math.ceil(data.totalCount / data.pageSize)),
        from: data.totalCount === 0 ? 0 : (data.page - 1) * data.pageSize + 1,
        to: (data.page - 1) * data.pageSize + data.items.length,
        total: data.totalCount,
      }
    : null;

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl">Bildirimler</h1>
          <p className="text-muted-foreground">Ödevler, yorumlar ve çözümlerle ilgili haberler.</p>
        </div>
        <Button type="button" variant="secondary" loading={readAll.isPending} onClick={() => readAll.mutate()}>
          <CheckCheck aria-hidden="true" />
          Tümünü Okundu İşaretle
        </Button>
      </div>

      <div role="group" aria-label="Bildirim filtresi" className="flex gap-2">
        {[
          { id: false, label: "Tümü" },
          { id: true, label: "Okunmamış" },
        ].map((tab) => (
          <button
            key={String(tab.id)}
            type="button"
            aria-pressed={unreadOnly === tab.id}
            onClick={() => {
              setUnreadOnly(tab.id);
              setPage(1);
            }}
            className={cn(
              "inline-flex min-h-touch items-center rounded-pill border px-4 text-sm font-semibold",
              unreadOnly === tab.id ? "border-primary bg-primary text-primary-foreground" : "border-border-strong bg-surface hover:bg-surface-muted",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {list.isPending ? (
        <div role="status" aria-label="Bildirimler yükleniyor" className="grid gap-3">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-20 animate-pulse rounded-lg bg-surface-muted" />
          ))}
        </div>
      ) : list.isError ? (
        <EmptyState
          icon={CloudOff}
          as="h2"
          title="Bildirimler Yüklenemedi"
          description={list.error.message}
          action={<Button onClick={() => list.refetch()}>Tekrar Dene</Button>}
        />
      ) : data && data.items.length === 0 ? (
        <EmptyState
          icon={BellOff}
          as="h2"
          title={unreadOnly ? "Okunmamış Bildirim Yok" : "Henüz Bildiriminiz Yok"}
          description="Yeni bir ödev, yorum ya da çözüm geldiğinde burada göreceksiniz."
        />
      ) : data ? (
        <>
          <ul className="flex flex-col gap-2" aria-label="Bildirimler">
            {data.items.map((item) => (
              <NotificationRow key={item.id} item={item} role={me.data?.role} onRead={(id) => readOne.mutate(id)} />
            ))}
          </ul>
          {slice ? <Pagination slice={slice} onPageChange={setPage} /> : null}
        </>
      ) : null}
    </div>
  );
}
