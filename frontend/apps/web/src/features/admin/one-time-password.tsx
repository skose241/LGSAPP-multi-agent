"use client";

import { Copy, Printer, ShieldAlert } from "lucide-react";
import { useId, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface OneTimePasswordPanelProps {
  userName: string;
  displayName: string;
  password: string;
  children?: ReactNode;
}

export function OneTimePasswordPanel({ userName, displayName, password, children }: OneTimePasswordPanelProps) {
  const warningId = useId();

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      toast.success("Şifre panoya kopyalandı.");
    } catch {
      toast.error("Kopyalanamadı. Şifreyi elle not alın.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        id={warningId}
        role="note"
        className="flex items-start gap-3 rounded-md border border-warning bg-warning-soft p-3 text-sm font-medium text-warning-soft-foreground"
      >
        <ShieldAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        Bu şifre bir daha gösterilmeyecek. Kullanıcıya iletin ya da giriş kartını yazdırın. Kullanıcı ilk girişte şifresini
        değiştirmek zorunda kalacak.
      </div>

      <section id="giris-karti" aria-label="Giriş kartı" className="flex flex-col gap-3 rounded-md border border-border-strong bg-surface p-4">
        <p className="text-sm text-muted-foreground">{displayName}</p>
        <dl className="grid gap-3">
          <div className="flex flex-col gap-1">
            <dt className="text-xs font-semibold text-muted-foreground">Kullanıcı Adı</dt>
            <dd className="break-all font-mono text-lg font-semibold" data-testid="otp-username">
              {userName}
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-xs font-semibold text-muted-foreground">Tek Seferlik Şifre</dt>
            <dd>
              <input
                readOnly
                aria-label="Tek Seferlik Şifre"
                aria-describedby={warningId}
                value={password}
                data-testid="one-time-password"
                onFocus={(event) => event.currentTarget.select()}
                className="h-12 w-full rounded-md border border-border-strong bg-surface-muted px-3 font-mono text-lg font-semibold"
              />
            </dd>
          </div>
        </dl>
      </section>

      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="secondary" onClick={copy}>
          <Copy aria-hidden="true" />
          Şifreyi Kopyala
        </Button>
        <Button type="button" variant="secondary" onClick={() => window.print()}>
          <Printer aria-hidden="true" />
          Giriş Kartını Yazdır
        </Button>
      </div>
      {children}
    </div>
  );
}
