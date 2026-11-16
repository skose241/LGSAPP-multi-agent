"use client";

import katex from "katex";
import "katex/dist/katex.min.css";
import { useMemo } from "react";
import { tokenizeMath } from "@/lib/student/math";
import { cn } from "@/lib/utils";

function render(value: string, displayMode: boolean): string {
  return katex.renderToString(value, {
    displayMode,
    throwOnError: false,
    trust: false,
    strict: "ignore",
    maxExpand: 1000,
    maxSize: 20,
    output: "htmlAndMathml",
  });
}

export function MathText({ text, className }: { text: string; className?: string }) {
  const segments = useMemo(() => tokenizeMath(text), [text]);

  return (
    <span className={cn("whitespace-pre-wrap break-words", className)}>
      {segments.map((segment, index) => {
        if (segment.type === "text") return <span key={index}>{segment.value}</span>;
        return (
          <span
            key={index}
            data-math={segment.type}
            className={segment.type === "display" ? "my-2 block overflow-x-auto" : undefined}
            dangerouslySetInnerHTML={{ __html: render(segment.value, segment.type === "display") }}
          />
        );
      })}
    </span>
  );
}
