import { ArrowLeft, ExternalLink, FileText, Scale } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { gplTextLink, lgplComponents } from "@/lib/licenses/components";
import { thirdPartyPackages } from "@/lib/licenses/third-party";

const linkClass = "inline-flex min-h-touch items-center gap-1.5 font-semibold text-primary underline underline-offset-4";

function External({ href, children }: { href: string; children: string }) {
  const outside = href.startsWith("http");
  return (
    <a href={href} className={linkClass} {...(outside ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      {children}
      {outside ? <ExternalLink className="size-4" aria-hidden="true" /> : <FileText className="size-4" aria-hidden="true" />}
    </a>
  );
}

export function LicensesView() {
  return (
    <div className="mx-auto flex w-full max-w-screen-md flex-col gap-6 px-safe py-6 pt-safe pb-safe">
      <Link href="/" className="inline-flex min-h-touch items-center gap-2 self-start text-sm font-semibold text-primary underline underline-offset-4">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Uygulamaya dön
      </Link>

      <header className="flex flex-col gap-2">
        <h1 className="text-3xl">Açık kaynak lisansları</h1>
        <p className="text-muted-foreground">
          LGS Hazırlık, aşağıdaki açık kaynak kütüphanelerden yararlanır. Bu sayfa herkese açıktır; giriş gerektirmez.
        </p>
      </header>

      <section aria-labelledby="lgpl-baslik" className="flex flex-col gap-4">
        <h2 id="lgpl-baslik" className="flex items-center gap-2 text-2xl">
          <Scale className="size-6 text-primary" aria-hidden="true" />
          GNU LGPL 3.0 ile lisanslı bileşenler
        </h2>
        <Card>
          <CardContent className="flex flex-col gap-3 text-sm" data-testid="lgpl-notice">
            <p>
              iPhone fotoğraflarını (HEIC/HEIF) JPEG&apos;e çevirmek için kullanılan <strong>heic-to</strong> kütüphanesi ve içindeki{" "}
              <strong>libheif</strong> ile <strong>libde265</strong> bileşenleri GNU Küçük Genel Kamu Lisansı sürüm 3 (LGPL-3.0) ile
              lisanslıdır.
            </p>
            <ul className="flex list-disc flex-col gap-1.5 pl-5">
              <li>
                Kütüphane uygulamanın ana kodundan ayrı bir dosya (chunk) olarak derlenir ve yalnız HEIC/HEIF türünde bir fotoğraf
                seçildiğinde tembel olarak yüklenir.
              </li>
              <li>
                Kütüphane uygulamaya bağlantı yoluyla dahil edilmiştir. Uygulamayı barındıran kurum, heic-to paketini değiştirilmiş bir
                sürümle değiştirip uygulamayı yeniden derleyerek yayınlayabilir; bu hak LGPL-3.0 kapsamında saklıdır.
              </li>
              <li>Kütüphanelerin kaynak kodları ve lisans metinleri aşağıdaki bağlantılardan alınabilir.</li>
            </ul>
            <div>
              <External href={gplTextLink.href}>{gplTextLink.label}</External>
              <p className="text-xs text-muted-foreground">LGPL-3.0, GNU GPL sürüm 3 metnine dayanır.</p>
            </div>
          </CardContent>
        </Card>

        <ul className="grid gap-4">
          {lgplComponents.map((component) => (
            <li key={component.id}>
              <Card>
                <CardContent className="flex flex-col gap-2" data-testid={`lgpl-${component.id}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg">{component.name}</h3>
                    <Badge tone="neutral">{component.version}</Badge>
                    <Badge tone="warning">{component.license}</Badge>
                  </div>
                  <p className="text-sm">{component.role}</p>
                  <p className="text-sm text-muted-foreground">Telif: {component.copyright}</p>
                  <div className="flex flex-col">
                    {component.sources.map((link) => (
                      <External key={link.href} href={link.href}>
                        {link.label}
                      </External>
                    ))}
                    {component.licenseText.map((link) => (
                      <External key={link.href} href={link.href}>
                        {link.label}
                      </External>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="diger-baslik" className="flex flex-col gap-4">
        <h2 id="diger-baslik" className="text-2xl">
          Diğer üretim bağımlılıkları
        </h2>
        <p className="text-sm text-muted-foreground">
          Uygulamanın doğrudan kullandığı paketler ve yazı tipleri. Bu liste derleme sırasında paket bilgilerinden üretilir.
        </p>
        <ul className="grid gap-3 md:grid-cols-2" data-testid="third-party-list">
          {thirdPartyPackages.map((entry) => (
            <li key={entry.name}>
              <Card className="h-full">
                <CardContent className="flex flex-col gap-1.5 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="break-all font-semibold">{entry.name}</span>
                    <Badge tone="neutral">{entry.version}</Badge>
                    <Badge tone="primary">{entry.license}</Badge>
                  </div>
                  {entry.copyright ? <p className="break-words text-xs text-muted-foreground">{entry.copyright}</p> : null}
                  <div className="flex flex-col">
                    {entry.repository ? <External href={entry.repository}>{`${entry.name} kaynak kodu`}</External> : null}
                    <External href={entry.npm}>{`${entry.name} (npm)`}</External>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
