"use client";

import { ClipboardList } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { useMe } from "@/features/auth/use-me";

export function StudentOnly({ children }: { children: ReactNode }) {
  const me = useMe();
  if (me.data && me.data.role !== "ogrenci") {
    return (
      <EmptyState
        icon={ClipboardList}
        as="h2"
        title="Bu sayfa öğrenciler için"
        description="Ödevleri yönetmek için ödev yönetimi ekranını kullanabilirsin."
        action={
          <Button asChild variant="secondary">
            <Link href="/ogretmen/odevler">Ödev yönetimi</Link>
          </Button>
        }
      />
    );
  }
  return <>{children}</>;
}
