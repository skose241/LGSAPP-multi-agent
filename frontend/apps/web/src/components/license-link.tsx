import { Scale } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function LicenseLink({ className }: { className?: string }) {
  return (
    <Link
      href="/lisanslar"
      className={cn("inline-flex min-h-touch items-center gap-2 text-sm text-muted-foreground underline underline-offset-4", className)}
    >
      <Scale className="size-4" aria-hidden="true" />
      Açık Kaynak Lisansları
    </Link>
  );
}
