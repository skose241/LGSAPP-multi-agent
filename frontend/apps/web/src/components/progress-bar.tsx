import { cn } from "@/lib/utils";

interface ProgressBarProps {
  label: string;
  value: number;
  max: number;
  tone?: "primary" | "success";
  className?: string;
}

export function ProgressBar({ label, value, max, tone = "primary", className }: ProgressBarProps) {
  const percent = max <= 0 ? 0 : Math.max(0, Math.min(100, Math.round((value / max) * 100)));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn("h-2.5 overflow-hidden rounded-pill bg-primary-100", className)}
    >
      <div className={cn("h-full rounded-pill", tone === "success" ? "bg-success" : "bg-primary")} style={{ width: `${percent}%` }} />
    </div>
  );
}
