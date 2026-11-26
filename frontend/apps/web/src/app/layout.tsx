import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { PwaSetup } from "@/components/pwa-setup";
import { Providers } from "@/components/providers";
import { bodyLatin, bodyLatinExt, displayLatin, displayLatinExt } from "@/lib/fonts";
import { cn } from "@/lib/utils";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "LGS Hazırlık", template: "%s | LGS Hazırlık" },
  description: "LGS sürecindeki öğrenciler için soru çözme ve ödev takip uygulaması.",
  robots: { index: false, follow: false },
  applicationName: "LGS Hazırlık",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/icons/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, title: "LGS Hazırlık", statusBarStyle: "default" },
  formatDetection: { telephone: false },
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
        <PwaSetup />
      </body>
    </html>
  );
}
