import { Crown, Flame } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface LeaderboardRowProps {
  rank: number;
  name: string;
  detail: string;
  points: number;
  isMe?: boolean;
  href?: string;
}

const rankStyles: Record<number, string> = {
  1: "bg-accent text-accent-foreground",
  2: "bg-neutral-200 text-neutral-900",
  3: "bg-accent-100 text-accent-800",
};

export function LeaderboardRow({ rank, name, detail, points, isMe = false, href }: LeaderboardRowProps) {
  const initials = name
    .split(" ")
    .map((part) => part.charAt(0))
    .slice(0, 2)
    .join("")
    .toLocaleUpperCase("tr-TR");

  const rowClass = cn(
    "flex min-h-16 items-center gap-3 rounded-md border px-3 py-2",
    isMe ? "border-primary bg-primary-soft" : "border-border bg-surface",
  );
  const content = (
    <>
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-pill font-display text-base font-bold",
          rankStyles[rank] ?? "bg-surface-muted text-foreground",
        )}
      >
        {rank === 1 ? <Crown className="size-5" aria-hidden="true" /> : null}
        <span className={rank === 1 ? "sr-only" : undefined}>{rank}</span>
      </span>
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-primary-100 text-sm font-bold text-primary-800"
      >
        {initials}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-semibold">
          {name}
          {isMe ? <span className="ml-1.5 text-xs font-bold text-primary-soft-foreground">(Siz)</span> : null}
        </span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Flame className="size-3.5 text-accent-600" aria-hidden="true" />
          {detail}
        </span>
      </span>
      <span className="text-right">
        <span className="block font-display text-lg font-bold leading-none">{points}</span>
        <span className="text-xs text-muted-foreground">puan</span>
      </span>
    </>
  );

  return (
    <li aria-current={isMe ? "true" : undefined}>
      {href ? (
        <Link href={href} data-testid="leaderboard-link" className={cn(rowClass, "transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted")}>
          {content}
        </Link>
      ) : (
        <div className={rowClass}>{content}</div>
      )}
    </li>
  );
}
