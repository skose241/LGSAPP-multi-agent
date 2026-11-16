"use client";

import { publicSettingsQuery } from "@lgs/api/queries";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";

export function usePublicSettings() {
  return useQuery(publicSettingsQuery(api()));
}
