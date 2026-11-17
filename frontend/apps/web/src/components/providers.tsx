"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Toaster } from "sonner";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster
        position="top-center"
        offset={{ top: "max(1rem, env(safe-area-inset-top))" }}
        mobileOffset={{ top: "max(0.75rem, env(safe-area-inset-top))" }}
        toastOptions={{
          classNames: {
            toast:
              "!rounded-lg !border !border-border !bg-surface-raised !text-foreground !shadow-lg !font-sans !text-sm",
            actionButton: "!h-11 !min-h-touch !px-4 !text-sm !font-semibold",
          },
        }}
      />
    </QueryClientProvider>
  );
}
