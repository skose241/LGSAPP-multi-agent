"use client";

import { LogOut, MonitorOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLogout } from "@/features/auth/use-logout";

export function SessionActions({ layout = "stack" }: { layout?: "stack" | "row" }) {
  const { logout, logoutAll, pending } = useLogout();

  return (
    <div className={layout === "row" ? "flex flex-wrap gap-3" : "flex flex-col gap-2"}>
      <Button type="button" variant="secondary" loading={pending === "one"} disabled={pending === "all"} onClick={logout}>
        <LogOut aria-hidden="true" />
        Çıkış Yap
      </Button>
      <Button type="button" variant="ghost" loading={pending === "all"} disabled={pending === "one"} onClick={logoutAll}>
        <MonitorOff aria-hidden="true" />
        Tüm Cihazlardan Çık
      </Button>
    </div>
  );
}
