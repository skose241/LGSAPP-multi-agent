"use client";

import { CheckCircle2, ImageIcon, MessageSquare, ThumbsUp, XCircle } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { OptionPicker } from "@/components/ui/option-picker";
import { cn } from "@/lib/utils";

export interface QuestionCardProps {
  lesson: string;
  topic: string;
  author: string;
  postedAt: string;
  description: string;
  initialAnswer?: string;
  correct: string;
  startRevealed?: boolean;
  footerExtra?: ReactNode;
}

export function QuestionCard({
  lesson,
  topic,
  author,
  postedAt,
  description,
  initialAnswer,
  correct,
  startRevealed = false,
  footerExtra,
}: QuestionCardProps) {
  const [answer, setAnswer] = useState<string | undefined>(initialAnswer);
  const [revealed, setRevealed] = useState(startRevealed);
  const isCorrect = revealed && answer === correct;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="primary">{lesson}</Badge>
          <Badge tone="neutral">{topic}</Badge>
        </div>
        <p className="pt-1 text-xs text-muted-foreground">
          {author} · {postedAt}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div
          role="img"
          aria-label="Soru görseli için yer tutucu"
          className="bg-placeholder flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-md border border-border text-muted-foreground"
        >
          <ImageIcon className="size-10" aria-hidden="true" />
          <span className="text-sm font-medium">Soru Görseli (4:3)</span>
        </div>
        <p className="max-w-prose text-base">{description}</p>
        <OptionPicker
          value={answer}
          onValueChange={setAnswer}
          correct={correct}
          revealed={revealed}
          label="Cevap şıkları"
        />
        {revealed ? (
          <div
            role="status"
            className={cn(
              "flex items-start gap-3 rounded-md p-3",
              isCorrect
                ? "bg-correct-soft text-correct-soft-foreground"
                : "bg-wrong-soft text-wrong-soft-foreground",
            )}
          >
            {isCorrect ? (
              <CheckCircle2 className="mt-0.5 size-6 shrink-0" aria-hidden="true" />
            ) : (
              <XCircle className="mt-0.5 size-6 shrink-0" aria-hidden="true" />
            )}
            <div>
              <p className="font-display text-lg font-bold">{isCorrect ? "Doğru Cevap!" : "Bu Sefer Olmadı"}</p>
              <p className="text-sm">
                {isCorrect
                  ? "Şimdi çözümünüzü kendi cümlelerinizle anlatın."
                  : `Doğru cevap ${correct} şıkkı. Nerede takıldığınızı çözüm olarak yazabilirsiniz.`}
              </p>
            </div>
          </div>
        ) : (
          <Button size="lg" disabled={!answer} onClick={() => setRevealed(true)}>
            Cevabı Gönder
          </Button>
        )}
      </CardContent>
      <CardFooter className="justify-between">
        <div className="flex items-center gap-1">
          <Button variant="ghost" className="gap-1.5 px-3">
            <ThumbsUp aria-hidden="true" />
            12
          </Button>
          <Button variant="ghost" className="gap-1.5 px-3">
            <MessageSquare aria-hidden="true" />4
          </Button>
        </div>
        {footerExtra}
      </CardFooter>
    </Card>
  );
}
