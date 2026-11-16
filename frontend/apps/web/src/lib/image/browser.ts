import type { Decoded, ImageDeps } from "./prepare";

function isBitmap(handle: unknown): handle is ImageBitmap {
  return typeof ImageBitmap !== "undefined" && handle instanceof ImageBitmap;
}

async function decodeWithImageElement(blob: Blob): Promise<Decoded> {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("boş görsel");
    return { width: image.naturalWidth, height: image.naturalHeight, handle: image };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function decodeNative(blob: Blob): Promise<Decoded> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
      return { width: bitmap.width, height: bitmap.height, handle: bitmap };
    } catch {
      return decodeWithImageElement(blob);
    }
  }
  return decodeWithImageElement(blob);
}

async function decodeHeic(blob: Blob): Promise<Decoded> {
  const { heicTo } = await import("heic-to/csp");
  const bitmap = await heicTo({ blob, type: "bitmap" });
  return { width: bitmap.width, height: bitmap.height, handle: bitmap };
}

async function render(decoded: Decoded, width: number, height: number, quality: number): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  try {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas yok");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(decoded.handle as CanvasImageSource, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob boş"))), "image/jpeg", quality);
    });
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

function release(decoded: Decoded) {
  const handle = decoded.handle;
  if (isBitmap(handle)) handle.close();
  else if (handle instanceof HTMLImageElement) handle.removeAttribute("src");
}

export const browserImageDeps: ImageDeps = { decodeNative, decodeHeic, render, release };
