const SECTION_PATTERNS: readonly (readonly [RegExp, string])[] = [
  [/^matematik$/u, "Matematik"],
  [/^fen bilimleri$/u, "Fen"],
  [/^türkçe$/u, "Türkçe"],
  [/inkılap tarihi/u, "İnkılap"],
  [/^din kültürü/u, "Din"],
  [/^(ingilizce|yabancı dil)$/u, "İngilizce"],
];

const SECTION_MAX_CHARS = 48;

function collapseDouble(text: string): string {
  if (text.length >= 4 && text.length % 2 === 0) {
    const half = text.length / 2;
    if (text.slice(0, half) === text.slice(half)) return text.slice(0, half);
  }
  return text;
}

export function sectionLabelOf(text: string): string | null {
  const folded = text
    .toLocaleLowerCase("tr")
    .replace(/[^\p{L} ]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  if (folded === "" || folded.length > SECTION_MAX_CHARS) return null;
  const collapsed = collapseDouble(folded);
  for (const [pattern, label] of SECTION_PATTERNS) {
    if (pattern.test(collapsed)) return label;
  }
  return null;
}
