"use client";

import { formatDateTimeShort, isApiError } from "@lgs/api";
import { studentProfileQuery } from "@lgs/api/queries";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Ban, CloudOff, UserX } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatsPanels } from "@/features/student/profile-stats";
import { api } from "@/lib/api/client";

const backLink = (
  <Link href="/ogretmen/ogrenciler" className="inline-flex min-h-touch items-center gap-2 self-start text-sm font-semibold text-primary underline underline-offset-4">
    <ArrowLeft className="size-4" aria-hidden="true" />
    Öğrenciler
  </Link>
);

export function StudentProfilePage({ id }: { id: number }) {
  const profile = useQuery(studentProfileQuery(api(), id));

  if (profile.isPending) {
    return <div role="status" aria-label="Öğrenci yükleniyor" className="h-96 animate-pulse rounded-lg bg-surface-muted" />;
  }

  if (profile.isError) {
    const missing = isApiError(profile.error) && profile.error.status === 404;
    return (
      <div className="flex flex-col gap-5">
        {backLink}
        <EmptyState
          icon={missing ? UserX : CloudOff}
          as="h2"
          title={missing ? "Öğrenci bulunamadı" : "Öğrenci yüklenemedi"}
          description={missing ? "Bu numarayla kayıtlı bir öğrenci yok." : profile.error.message}
          action={
            missing ? (
              <Button asChild variant="secondary">
                <Link href="/ogretmen/ogrenciler">Öğrenci listesine dön</Link>
              </Button>
            ) : (
              <Button onClick={() => profile.refetch()}>Tekrar Dene</Button>
            )
          }
        />
      </div>
    );
  }

  const { student, stats } = profile.data;
  const name = student.fullName || student.userName;

  return (
    <div className="flex flex-col gap-5">
      {backLink}
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl" data-testid="student-name">
            {name}
          </h1>
          {student.isBanned ? (
            <Badge tone="danger">
              <Ban aria-hidden="true" />
              Banlı
            </Badge>
          ) : null}
        </div>
        <p className="text-muted-foreground">
          <span className="font-mono">{student.userName}</span> · Kayıt tarihi {formatDateTimeShort(student.createdAt)}
        </p>
      </header>
      <StatsPanels data={stats} perspective="teacher" />
    </div>
  );
}
