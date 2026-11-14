import type { AdminUser } from "@lgs/api/queries";
import { Ban, Bot, KeyRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { roleLabel } from "@/lib/nav";

export function RoleBadge({ role }: { role: string | null }) {
  if (role === "ai") return <Badge tone="neutral">Yapay zekâ</Badge>;
  return <Badge tone={role === "mudur" ? "accent" : "primary"}>{roleLabel(role ?? undefined) || "Rol yok"}</Badge>;
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
      {user.mustChangePassword ? (
        <Badge tone="warning">
          <KeyRound aria-hidden="true" />
          Şifre değiştirmeli
        </Badge>
      ) : null}
      {user.isSystemAccount ? (
        <Badge tone="info">
          <Bot aria-hidden="true" />
          Sistem hesabı
        </Badge>
      ) : null}
    </>
  );
}
