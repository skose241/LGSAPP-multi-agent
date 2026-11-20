"use client";

import { aiSettingInfo, orderSettings } from "@lgs/api";
import { adminSettingsQuery } from "@lgs/api/queries";
import { useQuery } from "@tanstack/react-query";
import { CloudOff } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsEditor } from "@/features/admin/settings-editor";
import { api } from "@/lib/api/client";

export function AiSettingsForm() {
  const settings = useQuery(adminSettingsQuery(api()));

  return (
    <Card data-testid="ai-settings">
      <CardHeader>
        <CardTitle as="h2">Yapay Zekâ Ayarları</CardTitle>
      </CardHeader>
      <CardContent>
        {settings.isPending ? (
          <div role="status" aria-label="Ayarlar yükleniyor" className="h-48 animate-pulse rounded-lg bg-surface-muted" />
        ) : settings.isError ? (
          <EmptyState
            icon={CloudOff}
            as="h3"
            title="Ayarlar Alınamadı"
            description={settings.error.message}
            action={<Button onClick={() => settings.refetch()}>Tekrar Dene</Button>}
          />
        ) : (
          <SettingsEditor
            sections={[{ id: "ai", settings: orderSettings(settings.data.filter((item) => item.group === "ai")) }]}
            describe={aiSettingInfo}
            ariaLabel="Yapay Zekâ Ayarları"
          />
        )}
      </CardContent>
    </Card>
  );
}
