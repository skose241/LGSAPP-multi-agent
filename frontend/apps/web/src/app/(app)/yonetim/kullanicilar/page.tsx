import type { Metadata } from "next";
import { Suspense } from "react";
import { UsersList } from "@/features/admin/users-list";

export const metadata: Metadata = { title: "Kullanıcılar" };

export default function UsersPage() {
  return (
    <Suspense>
      <UsersList />
    </Suspense>
  );
}
