"use client";

import { generalSettingInfo, groupSettings } from "@lgs/api";
import { adminSettingsQuery } from "@lgs/api/queries";
import { useQuery } from "@tanstack/react-query";
import { CloudOff } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { MaintenanceCard } from "@/features/admin/maintenance-card";
import { SettingsEditor } from "@/features/admin/settings-editor";
import { api } from "@/lib/api/client";

export function GeneralSettingsPage() {
  const settings = useQuery(adminSettingsQuery(api()));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-3xl">Ayarlar</h1>
        <p className="text-muted-foreground">Puanlar, günlük limitler, yorum ve çözüm kuralları ile bakım işlemleri.</p>
      </div>
      {settings.isPending ? (
        <div role="status" aria-label="Ayarlar yükleniyor" className="h-64 animate-pulse rounded-lg bg-surface-muted" />
      ) : settings.isError ? (
        <EmptyState
          icon={CloudOff}
          as="h2"
          title="Ayarlar Alınamadı"
          description={settings.error.message}
          action={<Button onClick={() => settings.refetch()}>Tekrar Dene</Button>}
        />
      ) : (
        <SettingsEditor
          sections={groupSettings(settings.data).map(({ group, settings: items }) => ({
            id: group.id,
            title: group.title,
            description: group.description,
            settings: items,
          }))}
          describe={generalSettingInfo}
          ariaLabel="Genel ayarlar"
          guardLeave
          crossRules
        />
      )}
      <MaintenanceCard />
    </div>
  );
}
