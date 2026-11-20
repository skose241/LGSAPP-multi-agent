"use client";

import { Check, Copy, Download, ShieldAlert } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface RecoveryCodesPanelProps {
  codes: string[];
  onConfirm: () => void;
  confirmLabel?: string;
}

export function RecoveryCodesPanel({ codes, onConfirm, confirmLabel = "Devam Et" }: RecoveryCodesPanelProps) {
  const [saved, setSaved] = useState(false);
  const checkId = useId();
  const text = codes.join("\n");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Kodlar panoya kopyalandı.");
    } catch {
      toast.error("Kopyalanamadı. Kodları elle not alın.");
    }
  }

  function download() {
    const content = `LGS Hazırlık kurtarma kodları\nHer kod yalnızca bir kez kullanılabilir.\n\n${text}\n`;
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "lgs-kurtarma-kodlari.txt";
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        role="note"
        className="flex items-start gap-3 rounded-md border border-warning bg-warning-soft p-3 text-sm font-medium text-warning-soft-foreground"
      >
        <ShieldAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        Bu kodlar bir daha gösterilmeyecek. Şifrenizi unutursanız her kodla bir kez şifrenizi yenileyebilirsiniz. Güvenli bir yere
        kaydedin.
      </div>
      <ul aria-label="Kurtarma kodları" className="grid grid-cols-1 gap-2 sm:grid-cols-2" data-testid="recovery-codes">
        {codes.map((code) => (
          <li
            key={code}
            className="rounded-md border border-border bg-surface-muted px-3 py-2.5 text-center font-mono text-base font-semibold tracking-wider"
          >
            {code}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="secondary" onClick={copy}>
          <Copy aria-hidden="true" />
          Kopyala
        </Button>
        <Button type="button" variant="secondary" onClick={download}>
          <Download aria-hidden="true" />
          .txt İndir
        </Button>
      </div>
      <label htmlFor={checkId} className="flex min-h-touch cursor-pointer items-center gap-3 text-base font-semibold">
        <input
          id={checkId}
          type="checkbox"
          checked={saved}
          onChange={(event) => setSaved(event.target.checked)}
          className="size-6 shrink-0 accent-primary"
        />
        Kodları Güvenli Bir Yere Kaydettim
      </label>
      <Button type="button" size="lg" disabled={!saved} onClick={onConfirm}>
        <Check aria-hidden="true" />
        {confirmLabel}
      </Button>
    </div>
  );
}
