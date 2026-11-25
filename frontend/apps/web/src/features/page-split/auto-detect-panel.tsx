"use client";

import { Check, KeyRound, ScanSearch, Scissors, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface KeySuggestion {
  pages: number[];
  answerCount: number;
  conflicts: number[];
  sections: { name: string | null; count: number }[];
}

interface AutoDetectPanelProps {
  busy: boolean;
  disabled: boolean;
  suggestionCount: number;
  keySuggestion: KeySuggestion | null;
  trimming: boolean;
  trimProgress: { done: number; total: number } | null;
  onTrimCancel: () => void;
  trimmableCount: number;
  onDetect: (scope: "page" | "all") => void;
  onAccept: () => void;
  onReject: () => void;
  onApplyKey: () => void;
  onDismissKey: () => void;
  onTrimAll: () => void;
}

export function AutoDetectPanel({ busy, disabled, suggestionCount, keySuggestion, trimming, trimProgress, onTrimCancel, trimmableCount, onDetect, onAccept, onReject, onApplyKey, onDismissKey, onTrimAll }: AutoDetectPanelProps) {
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3" aria-label="Otomatik Bul" data-testid="auto-detect">
      <h3 className="text-base">Otomatik Bul</h3>
      <p className="text-sm text-muted-foreground">PDF içindeki metinden soru numaralarını okuyup çerçeve önerir. Önerileri kabul etmeden aktarılmaz.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => onDetect("page")} loading={busy} disabled={disabled} data-testid="auto-detect-page">
          <ScanSearch aria-hidden="true" />
          Bu Sayfa
        </Button>
        <Button type="button" variant="secondary" onClick={() => onDetect("all")} loading={busy} disabled={disabled} data-testid="auto-detect-all">
          <ScanSearch aria-hidden="true" />
          Tüm Sayfalar
        </Button>
      </div>
      {suggestionCount > 0 ? (
        <div className="flex flex-col gap-2" data-testid="suggestions">
          <p className="text-sm font-semibold" data-testid="suggestion-count" role="status">
            {suggestionCount} öneri var
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={onAccept} disabled={disabled} data-testid="suggestions-accept">
              <Check aria-hidden="true" />
              Önerileri Kabul Et
            </Button>
            <Button type="button" variant="secondary" onClick={onReject} disabled={disabled} data-testid="suggestions-reject">
              <X aria-hidden="true" />
              Önerileri Reddet
            </Button>
          </div>
        </div>
      ) : null}
      {keySuggestion ? (
        <div className="flex flex-col gap-2 rounded-md border border-info bg-info-soft p-2" data-testid="key-suggestion">
          <p className="text-sm font-medium text-info-soft-foreground">
            Cevap anahtarı bulundu: Sayfa {keySuggestion.pages.map((page) => page + 1).join(", ")}. {keySuggestion.answerCount > 0 ? `${keySuggestion.answerCount} cevap okundu${keySuggestion.sections.length > 1 ? ` (${keySuggestion.sections.map((section) => `${section.name ?? "Bölüm"}: ${section.count}`).join(", ")})` : ""}.` : "Cevaplar okunamadı."}
            {keySuggestion.conflicts.length > 0 ? ` Birden çok kez geçen numaralarda ilk değer alındı: ${keySuggestion.conflicts.slice(0, 6).join(", ")}.` : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={onApplyKey} disabled={disabled || keySuggestion.answerCount === 0} data-testid="key-apply">
              <KeyRound aria-hidden="true" />
              Cevapları Uygula
            </Button>
            <Button type="button" variant="secondary" onClick={onDismissKey} data-testid="key-dismiss">
              Yoksay
            </Button>
          </div>
        </div>
      ) : null}
      <Button type="button" variant="secondary" onClick={onTrimAll} loading={trimming} disabled={disabled || trimmableCount === 0} data-testid="trim-all">
        <Scissors aria-hidden="true" />
        Tüm Kenarları Sıkılaştır
      </Button>
      {trimming && trimProgress ? (
        <div className="flex flex-wrap items-center gap-2" data-testid="trim-progress-row">
          <p role="status" className="text-sm font-medium" data-testid="trim-progress">
            Sıkılaştırılıyor: {trimProgress.done}/{trimProgress.total}
          </p>
          <Button type="button" variant="secondary" onClick={onTrimCancel} data-testid="trim-cancel">
            İptal
          </Button>
        </div>
      ) : null}
    </section>
  );
}
