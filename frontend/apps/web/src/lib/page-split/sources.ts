import type { Rect, Rotation } from "./geometry";

export interface PageSize {
  width: number;
  height: number;
}

export interface PageSource {
  kind: "pdf" | "image";
  key: string;
  pageCount: number;
  pageSize(page: number): PageSize;
  renderPreview(page: number, maxEdge: number, rotation: Rotation, signal?: AbortSignal): Promise<Blob>;
  renderCrop(page: number, rect: Rect, rotation: Rotation, signal?: AbortSignal): Promise<Blob>;
  dispose(): void;
}

export type SourceFailureCode = "password" | "invalid" | "tooManyPages" | "tooLarge" | "empty" | "tooSmall" | "tooThin" | "render" | "aborted";

export class SourceError extends Error {
  readonly code: SourceFailureCode;

  constructor(code: SourceFailureCode, message: string) {
    super(message);
    this.name = "SourceError";
    this.code = code;
  }
}

export function isAbort(error: unknown): boolean {
  return (error instanceof DOMException && error.name === "AbortError") || (error instanceof SourceError && error.code === "aborted");
}

export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new SourceError("aborted", "İşlem iptal edildi.");
}
