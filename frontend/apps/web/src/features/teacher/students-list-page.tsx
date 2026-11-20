"use client";

import { formatRelativeTime } from "@lgs/api";
import { studentsQuery, type StudentListItem } from "@lgs/api/queries";
import { useQuery } from "@tanstack/react-query";
import { Ban, CloudOff, Search, UserX } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SelectField } from "@/components/ui/select-field";
import { api } from "@/lib/api/client";
import {
  lastValidPage,
  pageSlice,
  parseStudentFilters,
  percentLabel,
  SEARCH_MAX,
  STUDENT_SORTS,
  studentFiltersToSearch,
  type StudentFilters,
} from "@/lib/teacher/students";

const PAGE_SIZE = 20;
const DEBOUNCE_MS = 350;
const headerClasses = "px-3 py-3 font-semibold";

function BannedBadge() {
  return (
    <Badge tone="danger">
      <Ban aria-hidden="true" />
      Banlı
    </Badge>
  );
}

function lastActivity(item: StudentListItem): string {
  return item.lastAnsweredAt ? formatRelativeTime(item.lastAnsweredAt) : "Henüz cevap yok";
}

export function StudentsListPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filters = useMemo(() => parseStudentFilters(new URLSearchParams(params.toString())), [params]);
  const [input, setInput] = useState(filters.search);

  const list = useQuery(studentsQuery(api(), { search: filters.search.trim(), sort: filters.sort, page: filters.page, pageSize: PAGE_SIZE }));

  const lastPushed = useRef(filters.search);

  function update(next: Partial<StudentFilters>, mode: "push" | "replace" = "push") {
    const search = input.trim();
    const merged: StudentFilters = { ...filters, search, page: 1, ...next };
    const target = `${pathname}${studentFiltersToSearch(merged)}`;
    lastPushed.current = merged.search;
    const pendingSearch = search !== filters.search.trim();
    if (mode === "replace" || pendingSearch) router.replace(target);
    else router.push(target);
  }

  useEffect(() => {
    if (filters.search !== lastPushed.current) {
      lastPushed.current = filters.search;
      setInput(filters.search);
    }
  }, [filters.search]);

  useEffect(() => {
    if (input.trim() === filters.search.trim()) return;
    const timer = window.setTimeout(() => update({ search: input.trim() }, "replace"), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [input]);

  const clampTo = list.data ? lastValidPage(list.data.page, list.data.pageSize, list.data.totalCount, list.data.items.length) : null;

  useEffect(() => {
    if (clampTo !== null) update({ page: clampTo }, "replace");
  }, [clampTo]);

  const data = list.data;
  const slice = data ? pageSlice(data.page, data.pageSize, data.totalCount, data.items.length) : null;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-3xl">Öğrenciler</h1>
        <p className="text-muted-foreground">Öğrencilerin çözdüğü soruları, başarılarını ve son etkinliklerini inceleyin.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_16rem] md:items-end">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            aria-label="Öğrenci Ara"
            placeholder="Ad veya kullanıcı adı arayın"
            value={input}
            maxLength={SEARCH_MAX}
            onChange={(event) => setInput(event.target.value)}
            className="h-12 w-full rounded-md border border-border-strong bg-surface pl-10 pr-3 text-base placeholder:text-neutral-500 hover:border-neutral-600 focus-visible:border-primary"
          />
        </div>
        <SelectField label="Sıralama" value={filters.sort} onChange={(event) => update({ sort: event.target.value as StudentFilters["sort"] })}>
          {STUDENT_SORTS.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {entry.label}
            </option>
          ))}
        </SelectField>
      </div>

      {list.isPending ? (
        <div role="status" aria-label="Öğrenciler yükleniyor" className="grid gap-3">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="h-20 animate-pulse rounded-lg bg-surface-muted" />
          ))}
        </div>
      ) : list.isError ? (
        <EmptyState icon={CloudOff} as="h2" title="Öğrenciler Yüklenemedi" description={list.error.message} action={<Button onClick={() => list.refetch()}>Tekrar Dene</Button>} />
      ) : data && data.items.length === 0 ? (
        <EmptyState
          icon={UserX}
          as="h2"
          title={filters.search.trim() ? "Eşleşen Öğrenci Yok" : "Henüz Öğrenci Yok"}
          description={filters.search.trim() ? "Aramayı değiştirmeyi deneyin." : "Müdür öğrenci hesabı oluşturduğunda burada görünecek."}
        />
      ) : data ? (
        <>
          <Card className="hidden overflow-hidden xl:block">
            <table className="w-full table-fixed text-left text-sm" data-testid="students-table">
              <caption className="sr-only">Öğrenci Listesi</caption>
              <colgroup>
                <col className="w-[24%]" />
                <col className="w-[9%]" />
                <col className="w-[9%]" />
                <col className="w-[9%]" />
                <col className="w-[9%]" />
                <col className="w-[10%]" />
                <col className="w-[30%]" />
              </colgroup>
              <thead className="bg-surface-muted text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className={headerClasses}>
                    Öğrenci
                  </th>
                  <th scope="col" className={`${headerClasses} text-right`}>
                    Puan
                  </th>
                  <th scope="col" className={`${headerClasses} text-right`}>
                    Cevap
                  </th>
                  <th scope="col" className={`${headerClasses} text-right`}>
                    Doğru
                  </th>
                  <th scope="col" className={`${headerClasses} text-right`}>
                    Yanlış
                  </th>
                  <th scope="col" className={`${headerClasses} text-right`}>
                    Başarı
                  </th>
                  <th scope="col" className={headerClasses}>
                    Son Etkinlik
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id} className="border-t border-border" data-testid="student-row" data-user-name={item.userName}>
                    <td className="px-3 py-1">
                      <Link href={`/ogretmen/ogrenciler/${item.id}`} className="inline-flex min-h-touch max-w-full flex-col justify-center text-primary underline underline-offset-4">
                        <span className="truncate font-semibold">{item.fullName || item.userName}</span>
                        <span className="truncate font-mono text-xs text-muted-foreground">{item.userName}</span>
                      </Link>
                      {item.isBanned ? <BannedBadge /> : null}
                    </td>
                    <td className="px-3 py-1 text-right">{item.points}</td>
                    <td className="px-3 py-1 text-right">{item.answered}</td>
                    <td className="px-3 py-1 text-right">{item.correct}</td>
                    <td className="px-3 py-1 text-right">{item.wrong}</td>
                    <td className="px-3 py-1 text-right">{percentLabel(item.successRate)}</td>
                    <td className="px-3 py-1 text-muted-foreground">{lastActivity(item)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <ul className="grid gap-3 md:grid-cols-2 xl:hidden" aria-label="Öğrenci kartları">
            {data.items.map((item) => (
              <li key={item.id} data-testid="student-card" data-user-name={item.userName}>
                <Link
                  href={`/ogretmen/ogrenciler/${item.id}`}
                  className="flex min-h-touch flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm hover:bg-surface-muted"
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate text-base font-semibold">{item.fullName || item.userName}</span>
                      <span className="block truncate font-mono text-sm text-muted-foreground">{item.userName}</span>
                    </span>
                    {item.isBanned ? <BannedBadge /> : null}
                  </span>
                  <dl className="grid grid-cols-4 gap-2 text-center">
                    <div>
                      <dt className="text-xs text-muted-foreground">Puan</dt>
                      <dd className="font-display text-lg font-bold">{item.points}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Cevap</dt>
                      <dd className="font-display text-lg font-bold">{item.answered}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">D / Y</dt>
                      <dd className="font-display text-lg font-bold">
                        {item.correct}/{item.wrong}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Başarı</dt>
                      <dd className="font-display text-lg font-bold">{percentLabel(item.successRate)}</dd>
                    </div>
                  </dl>
                  <span className="text-xs text-muted-foreground">Son etkinlik: {lastActivity(item)}</span>
                </Link>
              </li>
            ))}
          </ul>

          {slice ? <Pagination slice={slice} onPageChange={(page) => update({ page })} /> : null}
        </>
      ) : null}
    </div>
  );
}
