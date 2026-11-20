export interface LgplComponent {
  id: string;
  name: string;
  version: string;
  license: string;
  copyright: string;
  role: string;
  sources: { label: string; href: string }[];
  licenseText: { label: string; href: string }[];
}

export const lgplComponents: LgplComponent[] = [
  {
    id: "heic-to",
    name: "heic-to",
    version: "1.6.7",
    license: "LGPL-3.0",
    copyright: "Hopper Gee ve katkıda bulunanlar",
    role: "iPhone HEIC/HEIF fotoğraflarını tarayıcıda JPEG'e çevirir.",
    sources: [
      { label: "heic-to Kaynak Kodu (GitHub)", href: "https://github.com/hoppergee/heic-to" },
      { label: "heic-to 1.6.7 (npm)", href: "https://www.npmjs.com/package/heic-to/v/1.6.7" },
    ],
    licenseText: [{ label: "heic-to Lisans Metni (LGPL-3.0)", href: "/licenses/heic-to-LICENSE.txt" }],
  },
  {
    id: "libheif",
    name: "libheif",
    version: "1.23.7",
    license: "LGPL-3.0",
    copyright: "struktur AG, Dirk Farin ve katkıda bulunanlar",
    role: "heic-to paketinin içine WebAssembly olarak derlenmiş HEIF çözücü kütüphanesi.",
    sources: [
      { label: "libheif Kaynak Kodu (GitHub)", href: "https://github.com/strukturag/libheif" },
      { label: "libheif v1.23.7 Sürümü", href: "https://github.com/strukturag/libheif/releases/tag/v1.23.7" },
    ],
    licenseText: [{ label: "libheif Lisans Metni (LGPL-3.0)", href: "/licenses/libheif-COPYING.txt" }],
  },
  {
    id: "libde265",
    name: "libde265",
    version: "1.0.16",
    license: "LGPL-3.0",
    copyright: "struktur AG, Dirk Farin ve katkıda bulunanlar",
    role: "libheif ile birlikte kullanılan H.265/HEVC çözücü kütüphanesi.",
    sources: [
      { label: "libde265 Kaynak Kodu (GitHub)", href: "https://github.com/strukturag/libde265" },
      { label: "libde265 v1.0.16 Sürümü", href: "https://github.com/strukturag/libde265/releases/tag/v1.0.16" },
    ],
    licenseText: [{ label: "libde265 Lisans Metni (LGPL-3.0)", href: "/licenses/libde265-COPYING.txt" }],
  },
];

export const gplTextLink = { label: "GNU GPL 3.0 Lisans Metni", href: "/licenses/GPL-3.0.txt" };
