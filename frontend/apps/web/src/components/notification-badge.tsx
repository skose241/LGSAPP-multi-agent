import { cn } from "@/lib/utils";

export function NotificationBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  const text = count > 99 ? "99+" : String(count);

  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-pill bg-accent px-1.5 text-xs font-bold leading-none text-accent-foreground ring-2 ring-surface",
        className,
      )}
    >
      <span aria-hidden="true">{text}</span>
      <span className="sr-only">{count} yeni</span>
    </span>
  );
}
