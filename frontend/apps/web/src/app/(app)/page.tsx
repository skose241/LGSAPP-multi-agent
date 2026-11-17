"use client";

import { CloudOff } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { MudurDashboard } from "@/features/admin/mudur-dashboard";
import { useMe } from "@/features/auth/use-me";
import { StudentDashboard } from "@/features/student/student-dashboard";
import { TeacherDashboard } from "@/features/teacher/teacher-dashboard";

export default function DashboardPage() {
  const me = useMe();
  const role = me.data?.role;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">Merhaba {me.data?.firstName ?? ""}</h1>
      {me.isError ? (
        <EmptyState
          icon={CloudOff}
          as="h2"
          title="Bilgilerin yüklenemedi"
          description={me.error.message}
          action={<Button onClick={() => me.refetch()}>Tekrar Dene</Button>}
        />
      ) : null}
      {role === "mudur" ? <MudurDashboard /> : null}
      {role === "ogretmen" ? <TeacherDashboard /> : null}
      {role === "ogrenci" ? <StudentDashboard /> : null}
    </div>
  );
}
