"use client";

import Link from "next/link";
import { LicenseLink } from "@/components/license-link";
import { useMe } from "@/features/auth/use-me";
import { navFor } from "@/lib/nav";

export default function MenuPage() {
  const me = useMe();
  const nav = navFor(me.data?.role);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl">Menü</h1>
      <ul className="grid gap-2 md:grid-cols-2">
        {nav.items.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.id}>
              <Link
                href={item.href}
                className="flex min-h-14 items-center gap-3 rounded-md border border-border bg-surface px-4 text-base font-semibold shadow-sm hover:bg-surface-muted"
              >
                <Icon className="size-5 text-primary" aria-hidden="true" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
      <LicenseLink className="self-start" />
    </div>
  );
}
