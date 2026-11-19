import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import { bodyLatin, bodyLatinExt, displayLatin, displayLatinExt } from "@/lib/fonts";
import { cn } from "@/lib/utils";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "LGS Hazırlık", template: "%s | LGS Hazırlık" },
  description: "LGS sürecindeki öğrenciler için soru çözme ve ödev takip uygulaması.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#3548c4",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  await connection();
  return (
    <html
      lang="tr"
      className={cn(
        bodyLatin.variable,
        bodyLatinExt.variable,
        displayLatin.variable,
        displayLatinExt.variable,
      )}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
