"use client";

import { adoptDraftOwner } from "@/lib/session/draft";
import type { components } from "@lgs/api";
import { useQuery } from "@tanstack/react-query";
import { api, run } from "@/lib/api/client";

export type Me = components["schemas"]["UserInfoDto"];
export const ME_KEY = ["me"] as const;

export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    staleTime: 60_000,
    queryFn: async (): Promise<Me> => {
      const result = await run(() => api().GET("/api/auth/me"));
      if (!result.ok) throw new Error(result.problem.message);
      adoptDraftOwner(result.data.id);
      return result.data;
    },
  });
}
