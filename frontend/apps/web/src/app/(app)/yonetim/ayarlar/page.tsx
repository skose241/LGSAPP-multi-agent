import type { Metadata } from "next";
import { GeneralSettingsPage } from "@/features/admin/general-settings-page";

export const metadata: Metadata = { title: "Ayarlar" };

export default function GeneralSettingsRoute() {
  return <GeneralSettingsPage />;
}
