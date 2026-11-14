interface Swatch {
  name: string;
  hex: string;
  className: string;
}

function channel(value: number) {
  const v = value / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

function inkFor(hex: string) {
  const l = luminance(hex);
  const onWhite = 1.05 / (l + 0.05);
  const onDark = (l + 0.05) / (luminance("#1a1a18") + 0.05);
  return onWhite >= onDark ? "#ffffff" : "#1a1a18";
}

export const primaryScale: Swatch[] = [
  { name: "50", hex: "#eff3ff", className: "bg-primary-50" },
  { name: "100", hex: "#dde6ff", className: "bg-primary-100" },
  { name: "200", hex: "#bfd0ff", className: "bg-primary-200" },
  { name: "300", hex: "#93aefb", className: "bg-primary-300" },
  { name: "400", hex: "#6685f2", className: "bg-primary-400" },
  { name: "500", hex: "#4560e0", className: "bg-primary-500" },
  { name: "600", hex: "#3548c4", className: "bg-primary-600" },
  { name: "700", hex: "#2b3a9c", className: "bg-primary-700" },
  { name: "800", hex: "#243079", className: "bg-primary-800" },
  { name: "900", hex: "#1c2457", className: "bg-primary-900" },
];

export const accentScale: Swatch[] = [
  { name: "50", hex: "#fff4ec", className: "bg-accent-50" },
  { name: "100", hex: "#ffe6d2", className: "bg-accent-100" },
  { name: "200", hex: "#ffcba6", className: "bg-accent-200" },
  { name: "300", hex: "#ffa96f", className: "bg-accent-300" },
  { name: "400", hex: "#f98640", className: "bg-accent-400" },
  { name: "500", hex: "#eb6a1e", className: "bg-accent-500" },
  { name: "600", hex: "#bf4b10", className: "bg-accent-600" },
  { name: "700", hex: "#9c3c10", className: "bg-accent-700" },
  { name: "800", hex: "#7a300e", className: "bg-accent-800" },
  { name: "900", hex: "#55220b", className: "bg-accent-900" },
];

export const neutralScale: Swatch[] = [
  { name: "0", hex: "#ffffff", className: "bg-neutral-0" },
  { name: "50", hex: "#f8f8f6", className: "bg-neutral-50" },
  { name: "100", hex: "#f0f0ec", className: "bg-neutral-100" },
  { name: "200", hex: "#e2e2dc", className: "bg-neutral-200" },
  { name: "300", hex: "#cbcbc3", className: "bg-neutral-300" },
  { name: "400", hex: "#8c8c84", className: "bg-neutral-400" },
  { name: "500", hex: "#6e6e67", className: "bg-neutral-500" },
  { name: "600", hex: "#55554f", className: "bg-neutral-600" },
  { name: "700", hex: "#3e3e3a", className: "bg-neutral-700" },
  { name: "800", hex: "#2a2a27", className: "bg-neutral-800" },
  { name: "900", hex: "#1a1a18", className: "bg-neutral-900" },
];

export const statusSwatches: Swatch[] = [
  { name: "Başarı", hex: "#1e7a4f", className: "bg-success-600" },
  { name: "Hata", hex: "#b42318", className: "bg-danger-600" },
  { name: "Uyarı", hex: "#8a5a00", className: "bg-warning-600" },
  { name: "Bilgi", hex: "#1d5fa8", className: "bg-info-600" },
  { name: "Doğru şık", hex: "#0f7b5f", className: "bg-correct-600" },
  { name: "Yanlış şık", hex: "#b3263e", className: "bg-wrong-600" },
];

export const statusSoftSwatches: Swatch[] = [
  { name: "Başarı zemin", hex: "#e3f5eb", className: "bg-success-50" },
  { name: "Hata zemin", hex: "#fdecea", className: "bg-danger-50" },
  { name: "Uyarı zemin", hex: "#fff3d6", className: "bg-warning-50" },
  { name: "Bilgi zemin", hex: "#e4f0fc", className: "bg-info-50" },
  { name: "Doğru zemin", hex: "#dff5ec", className: "bg-correct-50" },
  { name: "Yanlış zemin", hex: "#fce8ec", className: "bg-wrong-50" },
];

export function SwatchRow({ swatches, label }: { swatches: Swatch[]; label: string }) {
  return (
    <div>
      <h3 className="mb-2 text-base">{label}</h3>
      <ul className="grid grid-cols-5 gap-1.5 md:grid-cols-10 lg:grid-cols-11">
        {swatches.map((swatch) => (
          <li
            key={swatch.name}
            className={`${swatch.className} flex h-20 flex-col justify-end rounded-sm border border-black/5 p-1.5 text-xs font-semibold leading-tight`}
            style={{ color: inkFor(swatch.hex) }}
          >
            <span>{swatch.name}</span>
            <span className="font-normal">{swatch.hex}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SwatchGrid({ swatches, label }: { swatches: Swatch[]; label: string }) {
  return (
    <div>
      <h3 className="mb-2 text-base">{label}</h3>
      <ul className="grid grid-cols-2 gap-1.5 md:grid-cols-3 lg:grid-cols-6">
        {swatches.map((swatch) => (
          <li
            key={swatch.name}
            className={`${swatch.className} flex h-20 flex-col justify-end rounded-sm border border-black/5 p-2 text-sm font-semibold leading-tight`}
            style={{ color: inkFor(swatch.hex) }}
          >
            <span>{swatch.name}</span>
            <span className="text-xs font-normal">{swatch.hex}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
