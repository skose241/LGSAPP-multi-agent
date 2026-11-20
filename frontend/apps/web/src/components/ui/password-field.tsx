"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState, type InputHTMLAttributes, type Ref } from "react";
import { FieldShell } from "@/components/ui/field";
import { cn } from "@/lib/utils";

interface PasswordFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "type"> {
  label: string;
  hint?: string;
  error?: string;
  ref?: Ref<HTMLInputElement>;
}

export function PasswordField({ label, hint, error, required, className, ref, ...props }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <FieldShell label={label} hint={hint} error={error} required={required} className={className}>
      {({ id, describedBy, invalid }) => (
        <div className="relative">
          <input
            ref={ref}
            id={id}
            type={visible ? "text" : "password"}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            className={cn(
              "block h-12 w-full rounded-md border border-border-strong bg-surface pl-4 pr-14 text-base text-foreground placeholder:text-neutral-500 transition-colors hover:border-neutral-600 focus-visible:border-primary aria-invalid:border-danger aria-invalid:bg-danger-soft",
            )}
            {...props}
          />
          <button
            type="button"
            onClick={() => setVisible((value) => !value)}
            aria-label={visible ? "Şifreyi Gizle" : "Şifreyi Göster"}
            aria-pressed={visible}
            className="absolute right-0 top-0 flex size-12 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
          >
            {visible ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}
          </button>
        </div>
      )}
    </FieldShell>
  );
}
