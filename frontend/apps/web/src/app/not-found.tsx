import { SearchX } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md items-center px-safe">
      <EmptyState
        as="h2"
        icon={SearchX}
        title="Sayfa bulunamadı"
        description="Aradığın sayfa taşınmış ya da hiç olmamış olabilir."
        action={
          <Button asChild>
            <Link href="/">Ana sayfaya dön</Link>
          </Button>
        }
      />
    </main>
  );
}
