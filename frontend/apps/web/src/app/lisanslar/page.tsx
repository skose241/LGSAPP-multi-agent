import type { Metadata } from "next";
import { LicensesView } from "@/features/licenses/licenses-view";

export const metadata: Metadata = { title: "Açık Kaynak Lisansları" };

export default function LicensesPage() {
  return (
    <main className="min-h-dvh bg-background">
      <LicensesView />
    </main>
  );
}
