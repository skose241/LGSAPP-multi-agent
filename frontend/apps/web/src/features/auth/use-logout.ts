"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api, run } from "@/lib/api/client";
import { clearAllDrafts } from "@/lib/session/draft";

export function useLogout() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<"one" | "all" | null>(null);

  async function logout() {
    setPending("one");
    await run(() => api().POST("/api/auth/logout", { body: { refreshToken: null } }));
    clearAllDrafts();
    queryClient.clear();
    router.replace("/giris");
  }

  async function logoutAll() {
    setPending("all");
    const result = await run(() => api().POST("/api/auth/logout-all"));
    if (!result.ok && result.status !== 401) {
      setPending(null);
      toast.error(result.problem.message);
      return;
    }
    clearAllDrafts();
    queryClient.clear();
    router.replace("/giris");
  }

  return { logout, logoutAll, pending };
}
