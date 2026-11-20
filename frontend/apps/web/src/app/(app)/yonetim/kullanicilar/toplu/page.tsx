import type { Metadata } from "next";
import { BulkUsersPage } from "@/features/admin/bulk-users-page";

export const metadata: Metadata = { title: "Toplu Kullanıcı Ekle" };

export default function BulkUsersRoute() {
  return <BulkUsersPage />;
}
