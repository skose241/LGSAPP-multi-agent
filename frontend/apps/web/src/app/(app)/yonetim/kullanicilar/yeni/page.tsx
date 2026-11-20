import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CreateUserForm } from "@/features/admin/create-user-form";

export const metadata: Metadata = { title: "Yeni Kullanıcı" };

export default function NewUserPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <Link
        href="/yonetim/kullanicilar"
        className="inline-flex min-h-touch items-center self-start text-sm font-semibold text-primary underline underline-offset-4"
      >
        Kullanıcılar
      </Link>
      <h1 className="text-3xl">Yeni Kullanıcı</h1>
      <Suspense>
        <CreateUserForm />
      </Suspense>
    </div>
  );
}
