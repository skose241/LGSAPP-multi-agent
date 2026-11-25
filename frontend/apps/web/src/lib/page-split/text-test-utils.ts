import type { TextFragment } from "@/lib/pdf/text-content";
import { PAGE_ASPECT } from "./text-lines";

export const LINE_HEIGHT = 0.012;

export function frag(x: number, y: number, str: string, h = LINE_HEIGHT): TextFragment {
  return { str, x, y, w: (str.length * h * 0.5) / PAGE_ASPECT, h, fontSize: h };
}

export interface QuestionLayout {
  x: number;
  y: number;
  number: number;
  label?: (number: number) => string;
  options?: boolean;
}

export function question({ x, y, number, label = (value) => `${value}.`, options = true }: QuestionLayout): TextFragment[] {
  const parts = [frag(x, y, label(number)), frag(x + 0.035, y, "Aşağıdaki ifadelerden hangisi doğrudur?"), frag(x, y + 0.02, "Bu satır soru metninin devamıdır ve ikinci satırdır.")];
  if (options) {
    parts.push(frag(x + 0.02, y + 0.045, "A) 12"), frag(x + 0.12, y + 0.045, "B) 15"), frag(x + 0.22, y + 0.045, "C) 18"), frag(x + 0.32, y + 0.045, "D) 21"));
  }
  return parts;
}

export function column(x: number, numbers: readonly number[], top: number, pitch: number, label?: (number: number) => string): TextFragment[] {
  return numbers.flatMap((number, index) => question({ x, y: top + index * pitch, number, label }));
}

export function furniture(index: number, total: number): TextFragment[] {
  return [frag(0.06, 0.03, "1. Deneme Sınavı"), frag(0.7, 0.03, "Fen Bilimleri"), frag(0.06, 0.965, "Diğer sayfaya geçiniz."), frag(0.9, 0.965, `${index + 1}/${total}`)];
}
