import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, Ref } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex min-h-touch shrink-0 items-center justify-center gap-2 rounded-md px-5 text-base font-semibold whitespace-nowrap transition-colors select-none disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-600 disabled:shadow-none aria-busy:cursor-progress [&_svg]:size-5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover",
        secondary:
          "border border-border-strong bg-surface text-foreground hover:bg-surface-muted disabled:border-transparent",
        accent: "bg-accent text-accent-foreground shadow-sm hover:bg-accent-hover",
        ghost: "text-primary hover:bg-primary-soft disabled:bg-transparent",
        danger: "bg-danger text-white shadow-sm hover:bg-danger-hover",
      },
      size: {
        default: "h-11",
        lg: "h-14 px-6 text-lg",
        icon: "size-11 px-0",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  ref,
  ...props
}: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size }), className);

  if (asChild) {
    return (
      <Slot className={classes} ref={ref as Ref<HTMLElement>} {...props}>
        {children}
      </Slot>
    );
  }

  return (
    <button
      ref={ref}
      className={classes}
      disabled={disabled}
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      {...props}
      onClick={loading ? (event) => event.preventDefault() : props.onClick}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
