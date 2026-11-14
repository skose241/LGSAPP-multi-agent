import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  as?: "h2" | "h3";
}

export function EmptyState({ icon: Icon, title, description, action, as: Heading = "h3" }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border-strong bg-surface px-6 py-10 text-center">
      <span className="flex size-14 items-center justify-center rounded-pill bg-primary-soft text-primary-soft-foreground">
        <Icon className="size-7" aria-hidden="true" />
      </span>
      <Heading className="text-lg">{title}</Heading>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
