import { GraduationCap } from "lucide-react";
import type { ReactNode } from "react";

interface AuthCardProps {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthCard({ title, description, children, footer }: AuthCardProps) {
  return (
    <div className="flex w-full max-w-md flex-col gap-6">
      <div className="flex items-center gap-3">
        <span className="flex size-12 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <GraduationCap className="size-7" aria-hidden="true" />
        </span>
        <span className="font-display text-xl font-bold">LGS Hazırlık</span>
      </div>
      <div className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-5 shadow-md md:p-7">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl">{title}</h1>
          {description ? <p className="text-muted-foreground">{description}</p> : null}
        </div>
        {children}
      </div>
      {footer ? <div className="text-center text-sm">{footer}</div> : null}
    </div>
  );
}
