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
  quotaText?: string;
  onRequest?: () => void;
  requestDisabled?: boolean;
  notice?: ReactNode;
  solution?: ReactNode;
  actions?: ReactNode;
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
    title: "Çözüm İnceleniyor",
    text: "Yapay zekâ bu soruda cevap anahtarından farklı bir sonuca ulaştı; soru öğretmen incelemesinde. İnceleme bitene kadar yapay zekâ çözümü gösterilmez.",
    tone: "border-warning bg-warning-soft text-warning-soft-foreground",
  },
  removed: {
    icon: EyeOff,
    title: "Çözüm Kaldırıldı",
    text: "Bu soru için yapay zekâ çözümü kaldırıldı. Çözümü kendiniz yazarak katkı verebilirsiniz.",
    tone: "border-border-strong bg-surface-muted text-foreground",
  },
  unavailable: {
    icon: WifiOff,
    title: "Şu An Ulaşılamıyor",
    text: "Bu soru için şu an yapay zekâ çözümü üretilemiyor. Özellik kapalı olabilir ya da yapay zekâ güvenilir bir çözüm bulamamış olabilir. Çözümü kendiniz yazarak katkı verebilirsiniz.",
    tone: "border-info bg-info-soft text-info-soft-foreground",
  },
  unreadable: {
    icon: ScanSearch,
    title: "Görsel Okunamadı",
    text: "Soru görseli net okunamadığı için çözüm üretilemedi. Bu soru için bir süre (genellikle 24 saat) yeniden denenmez.",
    tone: "border-danger bg-danger-soft text-danger-soft-foreground",
  },
};

export function AiSolutionPanel({ state, quotaLeft, quotaText, onRequest, requestDisabled = false, notice, solution, actions }: AiSolutionPanelProps) {
  if (state === "none") {
    return (
      <PanelFrame tone="border-primary-200 bg-primary-soft text-primary-soft-foreground" icon={Sparkles} title="Yapay Zekâ Çözümü">
        <p className="text-sm">{onRequest ? "Takıldığınız yerde yapay zekâdan adım adım çözüm isteyebilirsiniz." : "Bu soru için henüz yapay zekâ çözümü istenmedi."}</p>
        {quotaText ? (
          <p className="text-xs font-semibold" data-testid="ai-quota">
            {quotaText}
          </p>
        ) : quotaLeft !== undefined ? (
          <p className="text-xs font-semibold">Bugün Kalan Hakkınız: {quotaLeft}</p>
        ) : null}
        {notice}
        {onRequest ? (
          <Button onClick={onRequest} disabled={requestDisabled} className="mt-1 self-start" data-testid="ai-request">
            <Bot aria-hidden="true" />
            Çözüm İste
          </Button>
        ) : null}
      </PanelFrame>
    );
  }

  if (state === "loading") {
    return (
      <PanelFrame tone="border-primary-200 bg-primary-soft text-primary-soft-foreground" icon={Hourglass} title="Çözüm Hazırlanıyor" busy>
        <p className="text-sm" role="status">
          Bu birkaç saniye sürebilir. Sayfayı kapatmayın.
        </p>
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
      <PanelFrame tone="border-primary-200 bg-surface text-foreground" icon={Bot} title="Yapay Zekâ Çözümü" testId="ai-solution">
        {solution}
        <p className="text-xs text-muted-foreground">
          Bu çözüm yapay zekâ tarafından üretildi. Hata olabilir, kendi çözümünüzle karşılaştırın.
        </p>
        {actions}
      </PanelFrame>
    );
  }

  const item = info[state];
  return (
    <PanelFrame tone={item.tone} icon={item.icon} title={item.title} testId={`ai-state-${state}`}>
      <p className="text-sm">{item.text}</p>
    </PanelFrame>
  );
}

function PanelFrame({
  tone,
  icon: Icon,
  title,
  busy = false,
  testId,
  children,
}: {
  tone: string;
  icon: LucideIcon;
  title: string;
  busy?: boolean;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-testid={testId}
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
