"use client";

import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ListedBox {
  id: string;
  number: number;
  page: number;
  option: string | undefined;
  transferred: boolean;
  suggested?: boolean;
  section?: string;
}

interface BoxListProps {
  boxes: ListedBox[];
  selectedId: string | null;
  disabled?: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

export function BoxList({ boxes, selectedId, disabled = false, onSelect, onDelete }: BoxListProps) {
  if (boxes.length === 0) {
    return <p className="text-sm text-muted-foreground">Henüz çerçeve yok. Sayfada bir soru alanını sürükleyerek çerçeveleyin.</p>;
  }
  return (
    <ul className="flex max-h-[40dvh] flex-col gap-1.5 overflow-y-auto lg:max-h-[55dvh]" aria-label="Çerçeveler" data-testid="box-list">
      {boxes.map((box) => (
        <li key={box.id} data-testid="box-row" data-number={box.number} data-option={box.option ?? ""} data-transferred={box.transferred} data-suggested={box.suggested === true} className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onSelect(box.id)}
            aria-pressed={box.id === selectedId}
            data-testid="box-select"
            className={cn("flex min-h-touch flex-1 items-center gap-2 rounded-md border px-3 text-left text-sm font-semibold", box.id === selectedId ? "border-primary bg-primary-soft" : "border-border bg-surface", box.suggested && "border-dashed")}
          >
            <span>
              {box.section ?? "Soru"} {box.number}
            </span>
            <span className="text-xs font-normal text-muted-foreground">Sayfa {box.page + 1}</span>
            {box.option ? <Badge tone="primary">{box.option}</Badge> : <Badge tone="warning">Şık Yok</Badge>}
            {box.suggested ? <Badge tone="info">Öneri</Badge> : null}
            {box.transferred ? <Badge tone="success">Aktarıldı</Badge> : null}
          </button>
          <Button type="button" variant="secondary" size="icon" onClick={() => onDelete(box.id)} disabled={disabled} aria-label={`${box.section ?? "Soru"} ${box.number} Çerçevesini Sil`}>
            <Trash2 aria-hidden="true" />
          </Button>
        </li>
      ))}
    </ul>
  );
}
