"use client";

import { formatDateTime, formatDateTimeShort } from "@lgs/api";
import { adminUsersQuery, type AdminUser } from "@lgs/api/queries";
import { useQuery } from "@tanstack/react-query";
import { CloudOff, Flag, ListPlus, Plus, Search, ShieldPlus, UserX } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { UserStatusBadges, RoleBadge } from "@/features/admin/user-badges";
import { api } from "@/lib/api/client";
import { paginate } from "@/lib/admin/pagination";
import { countByRole, countReported, filterUsers, fullName, ROLE_TABS, type RoleFilter } from "@/lib/admin/users";
import { cn } from "@/lib/utils";

const headerClasses = "px-3 py-3 font-semibold";

function BanInfo({ user }: { user: AdminUser }) {
  if (!user.isBanned || !user.bannedAt) return null;
  return (
    <span className="text-xs text-muted-foreground" data-testid="ban-date">
      Engellendi: {formatDateTimeShort(user.bannedAt)}
    </span>
  );
}

export function UsersList() {
  const users = useQuery(adminUsersQuery(api()));
  const [role, setRole] = useState<RoleFilter>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const reportedOnly = searchParams.get("sikayetli") === "1";

  function toggleReported() {
    const next = new URLSearchParams(searchParams.toString());
    if (reportedOnly) next.delete("sikayetli");
    else next.set("sikayetli", "1");
    const text = next.toString();
    router.replace(text ? `${pathname}?${text}` : pathname);
    setPage(1);
  }

  const counts = useMemo(() => countByRole(users.data ?? []), [users.data]);
  const reportedCount = useMemo(() => countReported(users.data ?? []), [users.data]);
  const filtered = useMemo(() => filterUsers(users.data ?? [], role, query, reportedOnly), [users.data, role, query, reportedOnly]);
  const slice = useMemo(() => paginate(filtered, page), [filtered, page]);
  const visible = slice.items;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl">Kullanıcılar</h1>
          <p className="text-muted-foreground">Öğretmen, öğrenci ve müdür hesaplarını yönet.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/yonetim/kullanicilar/yeni">
              <Plus aria-hidden="true" />
              Yeni kullanıcı
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/yonetim/kullanicilar/toplu">
              <ListPlus aria-hidden="true" />
              Toplu ekle
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/yonetim/kullanicilar/yeni?rol=mudur">
              <ShieldPlus aria-hidden="true" />
              Yeni müdür
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div role="group" aria-label="Rol filtresi" className="flex flex-wrap gap-2">
          {ROLE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              aria-pressed={role === tab.id}
              onClick={() => {
                setRole(tab.id);
                setPage(1);
              }}
              className={cn(
                "inline-flex min-h-touch items-center gap-2 rounded-pill border px-4 text-sm font-semibold transition-colors",
                role === tab.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border-strong bg-surface text-foreground hover:bg-surface-muted",
              )}
            >
              {tab.label}
              <span className={cn("text-xs", role === tab.id ? "text-primary-foreground" : "text-muted-foreground")}>
                {counts[tab.id]}
              </span>
            </button>
          ))}
          <button
            type="button"
            aria-pressed={reportedOnly}
            onClick={toggleReported}
            data-testid="reported-filter"
            className={cn(
              "inline-flex min-h-touch items-center gap-2 rounded-pill border px-4 text-sm font-semibold transition-colors",
              reportedOnly
                ? "border-warning bg-warning-soft text-warning-soft-foreground"
                : "border-border-strong bg-surface text-foreground hover:bg-surface-muted",
            )}
          >
            <Flag className="size-4" aria-hidden="true" />
            Yalnız şikâyetliler
            <span className="text-xs">{reportedCount}</span>
          </button>
        </div>
        <div className="relative w-full xl:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            aria-label="Kullanıcı ara"
            placeholder="Ad, kullanıcı adı veya sınıf ara"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            className="h-12 w-full rounded-md border border-border-strong bg-surface pl-10 pr-3 text-base placeholder:text-neutral-500 hover:border-neutral-600 focus-visible:border-primary"
          />
        </div>
      </div>

      {users.isPending ? (
        <div role="status" aria-label="Kullanıcılar yükleniyor" className="grid gap-3">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="h-20 animate-pulse rounded-lg bg-surface-muted" />
          ))}
        </div>
      ) : users.isError ? (
        <EmptyState
          icon={CloudOff}
          title="Kullanıcılar yüklenemedi"
          description={users.error.message}
          as="h2"
          action={<Button onClick={() => users.refetch()}>Tekrar Dene</Button>}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={UserX}
          as="h2"
          title={users.data.length === 0 ? "Henüz kullanıcı yok" : "Eşleşen kullanıcı yok"}
          description={
            users.data.length === 0
              ? "İlk öğretmen ya da öğrenci hesabını oluştur."
              : "Arama, rol ya da şikâyet filtresini değiştirmeyi dene."
          }
        />
      ) : (
        <>
          <Card className="hidden overflow-hidden xl:block">
            <table className="w-full table-fixed text-left text-sm">
              <caption className="sr-only">Kullanıcı listesi</caption>
              <colgroup>
                <col className="w-[19%]" />
                <col className="w-[19%]" />
                <col className="w-[9%]" />
                <col className="w-[11%]" />
                <col className="w-[22%]" />
                <col className="w-[20%]" />
              </colgroup>
              <thead className="bg-surface-muted text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className={headerClasses}>Ad soyad</th>
                  <th scope="col" className={headerClasses}>Kullanıcı adı</th>
                  <th scope="col" className={headerClasses}>Rol</th>
                  <th scope="col" className={headerClasses}>Sınıf / branş</th>
                  <th scope="col" className={headerClasses}>Durum</th>
                  <th scope="col" className={headerClasses}>Son giriş</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((user) => {
                  const name = fullName(user) || user.userName;
                  const detail = user.className ?? user.branchLessonName ?? "-";
                  return (
                    <tr key={user.id} className="border-t border-border">
                      <td className="truncate px-3 py-1" title={name}>
                        <Link
                          href={`/yonetim/kullanicilar/${user.id}`}
                          className="inline-flex min-h-touch max-w-full items-center truncate font-semibold text-primary underline underline-offset-4"
                        >
                          <span className="truncate">{name}</span>
                        </Link>
                      </td>
                      <td className="truncate px-3 py-1 font-mono" title={user.userName}>
                        {user.userName}
                      </td>
                      <td className="px-3 py-1">
                        <RoleBadge role={user.role} />
                      </td>
                      <td className="truncate px-3 py-1" title={detail}>
                        {detail}
                      </td>
                      <td className="px-3 py-1">
                        <div className="flex flex-wrap gap-1">
                          <UserStatusBadges user={user} />
                        </div>
                        <BanInfo user={user} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-1 text-muted-foreground">
                        {user.lastLoginAt ? formatDateTimeShort(user.lastLoginAt) : "Hiç girmedi"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          <ul className="grid gap-3 md:grid-cols-2 xl:hidden" aria-label="Kullanıcı kartları">
            {visible.map((user) => (
              <li key={user.id}>
                <Link
                  href={`/yonetim/kullanicilar/${user.id}`}
                  className="flex min-h-touch flex-col gap-2 rounded-lg border border-border bg-surface p-4 shadow-sm hover:bg-surface-muted"
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate text-base font-semibold">{fullName(user) || user.userName}</span>
                      <span className="block truncate font-mono text-sm text-muted-foreground">{user.userName}</span>
                    </span>
                    <RoleBadge role={user.role} />
                  </span>
                  {user.className || user.branchLessonName ? (
                    <span className="text-sm">{user.className ?? user.branchLessonName}</span>
                  ) : null}
                  <span className="flex flex-wrap gap-1.5">
                    <UserStatusBadges user={user} />
                  </span>
                  <BanInfo user={user} />
                  <span className="text-xs text-muted-foreground">
                    Son giriş: {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "Hiç girmedi"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <Pagination slice={slice} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
