export type MathSegment = { type: "text" | "inline" | "display"; value: string };

function isEscaped(text: string, index: number): boolean {
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) backslashes += 1;
  return backslashes % 2 === 1;
}

function findClosing(text: string, from: number, marker: string): number {
  let index = text.indexOf(marker, from);
  while (index !== -1 && isEscaped(text, index)) index = text.indexOf(marker, index + 1);
  return index;
}

function pushText(segments: MathSegment[], value: string) {
  if (!value) return;
  const last = segments[segments.length - 1];
  if (last?.type === "text") last.value += value;
  else segments.push({ type: "text", value });
}

export function tokenizeMath(text: string): MathSegment[] {
  const segments: MathSegment[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const start = text.indexOf("$", cursor);
    if (start === -1) {
      pushText(segments, text.slice(cursor));
      break;
    }

    if (isEscaped(text, start)) {
      pushText(segments, text.slice(cursor, start - 1) + "$");
      cursor = start + 1;
      continue;
    }

    const display = text.startsWith("$$", start);
    const marker = display ? "$$" : "$";
    const contentStart = start + marker.length;
    const end = findClosing(text, contentStart, marker);
    const content = end === -1 ? "" : text.slice(contentStart, end);
    const valid =
      end !== -1 &&
      content.length > 0 &&
      (display || (!/^\s/.test(content) && !/\s$/.test(content) && !content.includes("\n")));

    if (!valid) {
      pushText(segments, text.slice(cursor, start + marker.length));
      cursor = start + marker.length;
      continue;
    }

    pushText(segments, text.slice(cursor, start));
    segments.push({ type: display ? "display" : "inline", value: content });
    cursor = end + marker.length;
  }

  return segments;
}
