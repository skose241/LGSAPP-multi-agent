"use client";

import { AiSettingsForm } from "@/features/admin/ai-settings-form";
import { AiStatusCard } from "@/features/admin/ai-status-card";
import { AiUsageSection } from "@/features/admin/ai-usage-section";

export function AiAdminPage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-3xl">Yapay Zekâ</h1>
        <p className="text-muted-foreground">Sağlayıcı durumu, kullanım, maliyet ve yapay zekâ ayarları.</p>
      </div>
      <AiStatusCard />
      <AiUsageSection />
      <AiSettingsForm />
    </div>
  );
}
