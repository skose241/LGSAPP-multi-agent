import localFont from "next/font/local";

export const bodyLatin = localFont({
  src: "../../../../node_modules/@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2",
  weight: "300 900",
  variable: "--font-body-latin",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

export const bodyLatinExt = localFont({
  src: "../../../../node_modules/@fontsource-variable/figtree/files/figtree-latin-ext-wght-normal.woff2",
  weight: "300 900",
  variable: "--font-body-latin-ext",
  display: "swap",
});

export const displayLatin = localFont({
  src: "../../../../node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2",
  weight: "200 800",
  variable: "--font-display-latin",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

export const displayLatinExt = localFont({
  src: "../../../../node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-ext-wght-normal.woff2",
  weight: "200 800",
  variable: "--font-display-latin-ext",
  display: "swap",
});
