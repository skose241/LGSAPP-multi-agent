"use client";

import { addDaysToDateOnly, formatDateOnly, formatRelativeTime, todayInIstanbul } from "@lgs/api";
import {
  disputedQuestionsQuery,
  manageAssignmentsQuery,
  needsSolutionQuery,
  questionsQuery,
  reportsQuery,
  studentsQuery,
  topicPlansQuery,
} from "@lgs/api/queries";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { BookOpenCheck, CalendarClock, ClipboardList, FilePlus2, Flag, GraduationCap, ImageIcon, ShieldQuestion, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { MathText } from "@/components/math-text";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMe } from "@/features/auth/use-me";
import { api } from "@/lib/api/client";
import { isNoBranch } from "@/lib/teacher/needs-solution";
import { unplannedLessons } from "@/lib/teacher/dashboard";

function DashCard({ title, icon, testId, href, action, children }: { title: string; icon: ReactNode; testId: string; href: string; action: string; children: ReactNode }) {
  return (
    <Card data-testid={testId}>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          <span className="text-primary">{icon}</span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {children}
        <Button asChild variant="secondary" className="self-start">
          <Link href={href}>{action}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function QueryBody<T>({ query, label, children }: { query: UseQueryResult<T>; label: string; children: (data: T) => ReactNode }) {
  if (query.isPending) {
    return <div role="status" aria-label={`${label} yükleniyor`} className="h-14 animate-pulse rounded-md bg-surface-muted" />;
  }
  if (query.isError) {
    return (
      <div className="flex flex-col items-start gap-1">
        <p className="text-sm text-danger" data-testid="card-error">
          {label} yüklenemedi.
        </p>
        <Button type="button" variant="ghost" className="h-11 px-0" onClick={() => query.refetch()}>
          Tekrar dene
        </Button>
      </div>
    );
  }
  return <>{children(query.data)}</>;
}

function Big({ value, label, testId }: { value: number; label: string; testId: string }) {
  return (
    <div className="flex flex-col">
      <span className="font-display text-3xl font-bold" data-testid={testId}>
        {value}
      </span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}

function NeedsSolutionCard({ enabled }: { enabled: boolean }) {
  const query = useQuery(needsSolutionQuery(api(), { page: 1, pageSize: 1 }, enabled));
  return (
    <DashCard title="Çözüm bekleyenler" icon={<BookOpenCheck className="size-5" aria-hidden="true" />} testId="card-needs-solution" href="/ogretmen/cozum-bekleyenler" action="Listeye git">
      <QueryBody query={query} label="Çözüm bekleyenler">
        {(data) => <Big value={data.totalCount} label="Çözüm bekleyen soru" testId="needs-count" />}
      </QueryBody>
    </DashCard>
  );
}

function DisputedCard({ enabled }: { enabled: boolean }) {
  const query = useQuery({ ...disputedQuestionsQuery(api(), { page: 1, pageSize: 3 }), enabled });
  return (
    <DashCard title="Şüpheli anahtarlar" icon={<ShieldQuestion className="size-5" aria-hidden="true" />} testId="card-disputed" href="/ogretmen/supheli-anahtarlar" action="İncele">
      <QueryBody query={query} label="Şüpheli anahtarlar">
        {(data) => (
          <>
            <Big value={data.totalCount} label="İncelenmeyi bekleyen anahtar" testId="disputed-count" />
            {data.items.length > 0 ? (
              <ul className="flex flex-col gap-1 text-sm" aria-label="İlk şüpheli sorular">
                {data.items.map((item) => (
                  <li key={item.questionId}>
                    <Link href={`/ogretmen/supheli-anahtarlar/${item.questionId}`} className="inline-flex min-h-touch items-center text-primary underline underline-offset-4">
                      <span className="line-clamp-1">
                        {item.lessonName}: {item.summary || "Görselli soru"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </QueryBody>
    </DashCard>
  );
}

function BranchlessCard() {
  return (
    <DashCard title="Branş tanımlanmamış" icon={<ShieldQuestion className="size-5" aria-hidden="true" />} testId="card-no-branch" href="/profil" action="Profilime git">
      <p className="text-sm" data-testid="no-branch-text">
        Hesabınıza branş dersi tanımlanmamış. Çözüm bekleyenler ve şüpheli anahtarlar için müdüre başvurun.
      </p>
    </DashCard>
  );
}

function TopicsCard() {
  const tomorrow = addDaysToDateOnly(todayInIstanbul(), 1);
  const query = useQuery(topicPlansQuery(api(), tomorrow, tomorrow));
  return (
    <DashCard title="Yarının konuları" icon={<CalendarClock className="size-5" aria-hidden="true" />} testId="card-topics" href="/ogretmen/konu-plani" action="Konu planı">
      <QueryBody query={query} label="Konu planı">
        {(data) => {
          const missing = unplannedLessons(data);
          return missing.length === 0 ? (
            <p className="text-sm" data-testid="topics-done">
              Yarın için tüm derslerin konusu seçili.
            </p>
          ) : (
            <>
              <p className="text-sm">{formatDateOnly(tomorrow)} için konu seçilmemiş dersler:</p>
              <ul className="flex flex-wrap gap-1.5" aria-label="Konu seçilmemiş dersler">
                {missing.map((lesson) => (
                  <li key={lesson.lessonId} className="rounded-pill bg-warning-soft px-2.5 py-0.5 text-xs font-semibold text-warning-soft-foreground" data-testid="topics-missing">
                    {lesson.lessonName}
                  </li>
                ))}
              </ul>
            </>
          );
        }}
      </QueryBody>
    </DashCard>
  );
}

function ReportsCard() {
  const query = useQuery(reportsQuery(api(), { status: "pending", page: 1, pageSize: 1 }));
  return (
    <DashCard title="Bekleyen şikâyetler" icon={<Flag className="size-5" aria-hidden="true" />} testId="card-reports" href="/ogretmen/sikayetler" action="Şikâyetlere git">
      <QueryBody query={query} label="Şikâyetler">
        {(data) => <Big value={data.totalCount} label="Bekleyen şikâyet" testId="reports-count" />}
      </QueryBody>
    </DashCard>
  );
}

function AssignmentsCard() {
  const query = useQuery(manageAssignmentsQuery(api(), { status: "open", page: 1, pageSize: 3 }));
  return (
    <DashCard title="Aktif ödevler" icon={<ClipboardList className="size-5" aria-hidden="true" />} testId="card-assignments" href="/ogretmen/odevler" action="Ödev yönetimi">
      <QueryBody query={query} label="Ödevler">
        {(data) => (
          <>
            <Big value={data.totalCount} label="Açık ödev" testId="assignments-count" />
            {data.items.length > 0 ? (
              <ul className="flex flex-col gap-1 text-sm" aria-label="İlk açık ödevler">
                {data.items.map((item) => (
                  <li key={item.id} className="flex flex-col" data-testid="assignment-item">
                    <span className="font-semibold">{item.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {item.lesson.name} · Son gün {formatDateOnly(item.endDate)} · {item.participantCount} öğrenci
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </QueryBody>
    </DashCard>
  );
}

function StudentsCard() {
  const query = useQuery(studentsQuery(api(), { search: "", sort: "points", page: 1, pageSize: 5 }));
  return (
    <DashCard title="Öğrenciler" icon={<Users className="size-5" aria-hidden="true" />} testId="card-students" href="/ogretmen/ogrenciler" action="Tümü">
      <QueryBody query={query} label="Öğrenciler">
        {(data) =>
          data.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Henüz öğrenci yok.</p>
          ) : (
            <ol className="flex flex-col" aria-label="Puana göre ilk öğrenciler">
              {data.items.map((item, index) => (
                <li key={item.id} className="flex items-center justify-between gap-2" data-testid="top-student">
                  <Link href={`/ogretmen/ogrenciler/${item.id}`} className="inline-flex min-h-touch min-w-0 items-center gap-2 text-primary underline underline-offset-4">
                    <span className="text-muted-foreground">{index + 1}.</span>
                    <span className="truncate">{item.fullName || item.userName}</span>
                  </Link>
                  <span className="text-sm font-semibold">{item.points} puan</span>
                </li>
              ))}
            </ol>
          )
        }
      </QueryBody>
    </DashCard>
  );
}

function RecentStudentQuestionsCard() {
  const query = useQuery(questionsQuery(api(), { answered: "all", source: "student", page: 1, pageSize: 5 }));
  return (
    <DashCard title="Öğrencilerin son soruları" icon={<GraduationCap className="size-5" aria-hidden="true" />} testId="card-student-questions" href="/sorular?kaynak=student&durum=tumu" action="Hepsini gör">
      <QueryBody query={query} label="Öğrenci soruları">
        {(data) =>
          data.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Öğrenciler henüz soru yüklemedi.</p>
          ) : (
            <ul className="flex flex-col gap-1" aria-label="Öğrencilerin son soruları">
              {data.items.map((item) => (
                <li key={item.id} data-testid="student-question">
                  <Link href={`/sorular/${item.id}`} className="flex min-h-touch flex-col justify-center rounded-md px-1 hover:bg-surface-muted">
                    <span className="flex items-center gap-2 text-sm">
                      <span className="font-semibold">{item.lesson.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {item.author?.fullName || item.author?.userName || "Öğrenci"}
                        {item.publishedAt ? ` · ${formatRelativeTime(item.publishedAt)}` : ""}
                      </span>
                    </span>
                    {item.previewText ? (
                      <MathText text={item.previewText} compact className="line-clamp-1 overflow-hidden text-sm text-muted-foreground" />
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <ImageIcon className="size-3.5" aria-hidden="true" />
                        Görselli soru
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )
        }
      </QueryBody>
    </DashCard>
  );
}

export function TeacherDashboard() {
  const me = useMe();
  const loaded = me.isSuccess;
  const branchless = isNoBranch(me.data?.role, me.data?.branchLessonId);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button asChild>
          <Link href="/ogretmen/soru-ekle">
            <FilePlus2 aria-hidden="true" />
            Havuza soru ekle
          </Link>
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="teacher-dashboard">
        {branchless ? (
          <BranchlessCard />
        ) : (
          <>
            <NeedsSolutionCard enabled={loaded} />
            <DisputedCard enabled={loaded} />
          </>
        )}
        <TopicsCard />
        <ReportsCard />
        <AssignmentsCard />
        <StudentsCard />
        <RecentStudentQuestionsCard />
      </div>
    </div>
  );
}
