import { Bot, EyeOff, Hourglass, ScanSearch, ShieldAlert, Sparkles, WifiOff, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type AiPanelState =
  | "none"
  | "loading"
  | "available"
  | "underReview"
  | "removed"
  | "unavailable"
  | "unreadable";

interface AiSolutionPanelProps {
  state: AiPanelState;
  quotaLeft?: number;
  onRequest?: () => void;
  solution?: ReactNode;
}

interface StateInfo {
  icon: LucideIcon;
  title: string;
  text: string;
  tone: string;
}

const info: Record<Exclude<AiPanelState, "none" | "loading" | "available">, StateInfo> = {
  underReview: {
    icon: ShieldAlert,
    title: "Çözüm inceleniyor",
    text: "Bu sorunun cevap anahtarı şüpheli bulundu. Öğretmenin kontrol edene kadar yapay zekâ çözümü gösterilmez.",
    tone: "border-warning bg-warning-soft text-warning-soft-foreground",
  },
  removed: {
    icon: EyeOff,
    title: "Çözüm kaldırıldı",
    text: "Bu soru için yapay zekâ çözümü kaldırıldı. Çözümü kendin yazarak katkı verebilirsin.",
    tone: "border-border-strong bg-surface-muted text-foreground",
  },
  unavailable: {
    icon: WifiOff,
    title: "Şu an ulaşılamıyor",
    text: "Yapay zekâ çözümü bir süre kullanılamıyor. Biraz sonra tekrar dene.",
    tone: "border-info bg-info-soft text-info-soft-foreground",
  },
  unreadable: {
    icon: ScanSearch,
    title: "Görsel okunamadı",
    text: "Soru görseli yeterince net olmadığı için çözüm üretilemedi. Daha net bir fotoğrafla yeniden yüklenebilir.",
    tone: "border-danger bg-danger-soft text-danger-soft-foreground",
  },
};

export function AiSolutionPanel({ state, quotaLeft, onRequest, solution }: AiSolutionPanelProps) {
  if (state === "none") {
    return (
      <PanelFrame tone="border-primary-200 bg-primary-soft text-primary-soft-foreground" icon={Sparkles} title="Yapay zekâ çözümü">
        <p className="text-sm">Takıldığın yerde yapay zekâdan adım adım çözüm isteyebilirsin.</p>
        {quotaLeft !== undefined ? (
          <p className="text-xs font-semibold">Bugün kalan hakkın: {quotaLeft}</p>
        ) : null}
        <Button onClick={onRequest} className="mt-1 self-start">
          <Bot aria-hidden="true" />
          Çözüm İste
        </Button>
      </PanelFrame>
    );
  }

  if (state === "loading") {
    return (
      <PanelFrame tone="border-primary-200 bg-primary-soft text-primary-soft-foreground" icon={Hourglass} title="Çözüm hazırlanıyor" busy>
        <p className="text-sm">Bu birkaç saniye sürebilir. Sayfayı kapatma.</p>
        <div className="mt-1 flex flex-col gap-2" aria-hidden="true">
          <div className="h-3 w-full animate-pulse rounded-pill bg-primary-200" />
          <div className="h-3 w-5/6 animate-pulse rounded-pill bg-primary-200" />
          <div className="h-3 w-2/3 animate-pulse rounded-pill bg-primary-200" />
        </div>
      </PanelFrame>
    );
  }

  if (state === "available") {
    return (
      <PanelFrame tone="border-primary-200 bg-surface text-foreground" icon={Bot} title="Yapay zekâ çözümü">
        {solution}
        <p className="text-xs text-muted-foreground">
          Bu çözüm yapay zekâ tarafından üretildi. Hata olabilir, kendi çözümünle karşılaştır.
        </p>
      </PanelFrame>
    );
  }

  const item = info[state];
  return (
    <PanelFrame tone={item.tone} icon={item.icon} title={item.title}>
      <p className="text-sm">{item.text}</p>
    </PanelFrame>
  );
}

function PanelFrame({
  tone,
  icon: Icon,
  title,
  busy = false,
  children,
}: {
  tone: string;
  icon: LucideIcon;
  title: string;
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      aria-busy={busy || undefined}
      className={cn("flex flex-col gap-2 rounded-lg border p-4", tone)}
    >
      <h3 className="flex items-center gap-2 text-base">
        <Icon className="size-5" aria-hidden="true" />
        {title}
      </h3>
      {children}
    </div>
  );
}
