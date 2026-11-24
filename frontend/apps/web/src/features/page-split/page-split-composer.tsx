"use client";

import { useCallback, useRef, useState, type ComponentProps } from "react";
import { PhotoQuestionComposer, type ComposerCardInfo, type ComposerHandle } from "@/features/upload/photo-question-composer";
import { PageSplitter } from "./page-splitter";

type ComposerProps = Omit<ComponentProps<typeof PhotoQuestionComposer>, "ref" | "hidePicker" | "onCardsChange">;

interface PageSplitComposerProps extends ComposerProps {
  scope: string;
  onPendingChange?: (count: number) => void;
}

export function PageSplitComposer({ scope, onPendingChange, ...composerProps }: PageSplitComposerProps) {
  const composerRef = useRef<ComposerHandle | null>(null);
  const [cards, setCards] = useState<ComposerCardInfo[]>([]);

  const handleCards = useCallback(
    (next: ComposerCardInfo[]) => {
      setCards(next);
      onPendingChange?.(next.filter((card) => card.phase !== "created").length);
    },
    [onPendingChange],
  );

  return (
    <div className="flex flex-col gap-6" data-testid="page-split-composer">
      <PageSplitter scope={scope} composerRef={composerRef} cards={cards} disabled={composerProps.disabled} />
      <PhotoQuestionComposer {...composerProps} ref={composerRef} hidePicker onCardsChange={handleCards} />
    </div>
  );
}
