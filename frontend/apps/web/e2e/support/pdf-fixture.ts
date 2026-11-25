export const PAGE_WIDTH = 595;
export const PAGE_HEIGHT = 842;
export const QUESTIONS_PER_PAGE = 8;

export interface PdfFixtureOptions {
  pages: number;
  questionsPerPage?: number;
  textless?: boolean;
  footer?: string;
  rotate?: 90 | 180 | 270;
  answerKey?: string;
  firstNumber?: number;
  gapAfter?: number;
}

export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function questionRect(index: number): NormalizedRect {
  const column = index % 2;
  const row = Math.floor(index / 2);
  return { x: column === 0 ? 0.05 : 0.52, y: 0.05 + row * 0.235, width: 0.43, height: 0.21 };
}

const COLORS = ["0.95 0.80 0.80", "0.80 0.90 0.95", "0.85 0.95 0.80", "0.97 0.92 0.75"];

function pageContent(pageIndex: number, perPage: number, options: PdfFixtureOptions): string {
  const parts: string[] = [];
  for (let index = 0; index < perPage; index += 1) {
    const rect = questionRect(index);
    const x = rect.x * PAGE_WIDTH;
    const width = rect.width * PAGE_WIDTH;
    const height = rect.height * PAGE_HEIGHT;
    const y = PAGE_HEIGHT - (rect.y * PAGE_HEIGHT + height);
    const leftCount = Math.ceil(perPage / 2);
    const slot = index % 2 === 0 ? Math.floor(index / 2) : leftCount + Math.floor(index / 2);
    const raw = (options.firstNumber ?? 1) + pageIndex * perPage + slot;
    const number = options.gapAfter !== undefined && raw > options.gapAfter ? raw + 1 : raw;
    parts.push(`${COLORS[index % COLORS.length]} rg ${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re f`);
    if (!options.textless) parts.push(`0 0 0 rg BT /F1 28 Tf ${(x + 12).toFixed(2)} ${(y + height - 40).toFixed(2)} Td (Soru ${number}) Tj ET`);
  }
  if (options.footer && !options.textless) parts.push(`0 0 0 rg BT /F1 10 Tf 40 12 Td (${options.footer}) Tj ET`);
  return parts.join("\n");
}

function answerKeyContent(letters: string): string {
  const parts = ["0 0 0 rg BT /F1 22 Tf 60 780 Td (CEVAP ANAHTARI) Tj ET"];
  [...letters].forEach((letter, index) => {
    parts.push(`BT /F1 16 Tf 60 ${(740 - index * 26).toFixed(2)} Td (${index + 1}. ${letter}) Tj ET`);
  });
  return parts.join("\n");
}

export function buildPdf(options: PdfFixtureOptions): Buffer {
  const { pages, questionsPerPage = QUESTIONS_PER_PAGE } = options;
  const contents: string[] = [];
  for (let index = 0; index < pages; index += 1) contents.push(pageContent(index, questionsPerPage, options));
  if (options.answerKey) contents.push(answerKeyContent(options.answerKey));
  const rotate = options.rotate ? ` /Rotate ${options.rotate}` : "";
  const objects: string[] = [];
  const pageObjectIds: number[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  for (const content of contents) {
    const pageId = objects.length + 1;
    const contentId = pageId + 1;
    pageObjectIds.push(pageId);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}]${rotate} /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
  }
  objects[1] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${contents.length} >>`;

  let output = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(output));
    output += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) output += `${String(offset).padStart(10, "0")} 00000 n \n`;
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(output, "latin1");
}

export function brokenPdf(): Buffer {
  return Buffer.from("%PDF-1.4\nbu dosya bozuk, nesne yok\n", "latin1");
}

export function pdfFile(name: string, options: PdfFixtureOptions) {
  return { name, mimeType: "application/pdf", buffer: buildPdf(options) };
}
