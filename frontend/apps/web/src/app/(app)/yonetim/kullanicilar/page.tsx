import type { Metadata } from "next";
import { UsersList } from "@/features/admin/users-list";

export const metadata: Metadata = { title: "Kullanıcılar" };

export default function UsersPage() {
  return <UsersList />;
}
