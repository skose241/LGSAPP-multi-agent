"use client";

import { ChevronDown } from "lucide-react";
import type { Ref, SelectHTMLAttributes } from "react";
import { FieldShell } from "@/components/ui/field";

interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> {
  label: string;
  hint?: string;
  error?: string;
  ref?: Ref<HTMLSelectElement>;
}

export function SelectField({ label, hint, error, required, className, children, ref, ...props }: SelectFieldProps) {
  return (
    <FieldShell label={label} hint={hint} error={error} required={required} className={className}>
      {({ id, describedBy, invalid }) => (
        <div className="relative">
          <select
            ref={ref}
            id={id}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            className="block h-12 w-full appearance-none rounded-md border border-border-strong bg-surface pl-4 pr-10 text-base text-foreground hover:border-neutral-600 focus-visible:border-primary disabled:cursor-not-allowed disabled:bg-surface-muted aria-invalid:border-danger aria-invalid:bg-danger-soft"
            {...props}
          >
            {children}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        </div>
      )}
    </FieldShell>
  );
}
