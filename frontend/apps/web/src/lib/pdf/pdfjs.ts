import type * as Pdfjs from "pdfjs-dist";
import { SourceError } from "@/lib/page-split/sources";

export type PdfjsModule = typeof Pdfjs;

let loading: Promise<PdfjsModule> | null = null;

export function pdfAssetBase(version: string): string {
  return `/pdfjs/${version}/`;
}

export async function loadPdfjs(): Promise<PdfjsModule> {
  if (!loading) {
    loading = import("pdfjs-dist/legacy/build/pdf.min.mjs")
      .then((lib) => {
        lib.GlobalWorkerOptions.workerSrc = `${pdfAssetBase(lib.version)}pdf.worker.min.mjs`;
        return lib;
      })
      .catch((error: unknown) => {
        loading = null;
        throw error;
      });
  }
  return loading;
}

export function documentOptions(version: string, data: Uint8Array) {
  const base = pdfAssetBase(version);
  return {
    data,
    cMapUrl: `${base}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${base}standard_fonts/`,
    wasmUrl: `${base}wasm/`,
    iccUrl: `${base}iccs/`,
    isEvalSupported: false,
    enableXfa: false,
    useSystemFonts: false,
  };
}

export function mapPdfError(error: unknown): SourceError {
  if (error instanceof SourceError) return error;
  const name = typeof error === "object" && error !== null && "name" in error ? String((error as { name: unknown }).name) : "";
  if (name === "PasswordException") return new SourceError("password", "Bu PDF şifreli. Şifresiz bir kopyasını kaydedip tekrar deneyin.");
  if (name === "InvalidPDFException" || name === "FormatError") return new SourceError("invalid", "Bu dosya geçerli bir PDF değil ya da bozuk. Başka bir dosya seçin.");
  if (name === "MissingPDFException") return new SourceError("invalid", "PDF dosyası okunamadı. Tekrar seçin.");
  if (name === "AbortException" || name === "RenderingCancelledException") return new SourceError("aborted", "İşlem iptal edildi.");
  return new SourceError("invalid", "PDF açılamadı. Dosyanın bozuk olmadığından emin olup tekrar deneyin.");
}
