import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap [&_svg]:size-3.5",
  {
    variants: {
      tone: {
        neutral: "bg-surface-muted text-foreground",
        primary: "bg-primary-soft text-primary-soft-foreground",
        accent: "bg-accent-soft text-accent-soft-foreground",
        success: "bg-success-soft text-success-soft-foreground",
        danger: "bg-danger-soft text-danger-soft-foreground",
        warning: "bg-warning-soft text-warning-soft-foreground",
        info: "bg-info-soft text-info-soft-foreground",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
