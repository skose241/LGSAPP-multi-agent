"use client";

import { formatDateTimeShort, isApiError } from "@lgs/api";
import { studentProfileQuery } from "@lgs/api/queries";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Ban, CloudOff, UserX } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatsPanels } from "@/features/student/profile-stats";
import { StudentAnswersTab } from "@/features/teacher/student-answers-tab";
import { StudentUploadsTab } from "@/features/teacher/student-uploads-tab";
import { api } from "@/lib/api/client";
import { PROFILE_TABS, parseProfileView, profileViewToSearch, type ProfileView } from "@/lib/teacher/student-review";
import { cn } from "@/lib/utils";

const backLink = (
  <Link href="/ogretmen/ogrenciler" className="inline-flex min-h-touch items-center gap-2 self-start text-sm font-semibold text-primary underline underline-offset-4">
    <ArrowLeft className="size-4" aria-hidden="true" />
    Öğrenciler
  </Link>
);

export function StudentProfilePage({ id }: { id: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const view = useMemo(() => parseProfileView(new URLSearchParams(params.toString())), [params]);
  const profile = useQuery(studentProfileQuery(api(), id));

  function go(next: ProfileView) {
    router.push(`${pathname}${profileViewToSearch(next)}`);
  }

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
          title={missing ? "Öğrenci Bulunamadı" : "Öğrenci Yüklenemedi"}
          description={missing ? "Bu numarayla kayıtlı bir öğrenci yok." : profile.error.message}
          action={
            missing ? (
              <Button asChild variant="secondary">
                <Link href="/ogretmen/ogrenciler">Öğrenci Listesine Dön</Link>
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
          <span className="font-mono">{student.userName}</span> · Kayıt Tarihi {formatDateTimeShort(student.createdAt)}
        </p>
      </header>
      <div role="tablist" aria-label="Öğrenci bölümleri" className="flex flex-wrap gap-2">
        {PROFILE_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`profile-tab-${tab.id}`}
            aria-selected={view.tab === tab.id}
            aria-controls="profile-tabpanel"
            onClick={() => go({ tab: tab.id, page: 1 })}
            className={cn(
              "inline-flex min-h-touch items-center rounded-pill border px-4 text-sm font-semibold transition-colors",
              view.tab === tab.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border-strong bg-surface text-foreground hover:bg-surface-muted",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="profile-tabpanel" aria-labelledby={`profile-tab-${view.tab}`} className="flex flex-col gap-5">
        {view.tab === "stats" ? <StatsPanels data={stats} perspective="teacher" /> : null}
        {view.tab === "uploads" ? <StudentUploadsTab studentId={id} page={view.page} onPageChange={(page) => go({ ...view, page })} /> : null}
        {view.tab === "answers" ? (
          <StudentAnswersTab
            studentId={id}
            page={view.page}
            lessonId={view.lessonId}
            onPageChange={(page) => go({ ...view, page })}
            onLessonChange={(lessonId) => go({ tab: "answers", page: 1, lessonId })}
          />
        ) : null}
      </div>
    </div>
  );
}
