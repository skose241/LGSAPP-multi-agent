import type { AdminUser } from "@lgs/api/queries";
import { Ban, Bot, Flag, KeyRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { roleLabel } from "@/lib/nav";

export function RoleBadge({ role }: { role: string | null }) {
  if (role === "ai") return <Badge tone="neutral">Yapay Zekâ</Badge>;
  return <Badge tone={role === "mudur" ? "accent" : "primary"}>{roleLabel(role ?? undefined) || "Rol Yok"}</Badge>;
}

export function UserStatusBadges({ user }: { user: AdminUser }) {
  return (
    <>
      {user.isBanned ? (
        <Badge tone="danger">
          <Ban aria-hidden="true" />
          Banlı
        </Badge>
      ) : null}
      {user.pendingReportCount > 0 ? (
        <Badge tone="warning">
          <Flag aria-hidden="true" />
          Şikâyet Var ({user.pendingReportCount})
        </Badge>
      ) : null}
      {user.mustChangePassword ? (
        <Badge tone="warning">
          <KeyRound aria-hidden="true" />
          Şifre Değiştirmeli
        </Badge>
      ) : null}
      {user.isSystemAccount ? (
        <Badge tone="info">
          <Bot aria-hidden="true" />
          Sistem Hesabı
        </Badge>
      ) : null}
    </>
  );
}
