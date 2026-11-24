import type { Rotation } from "./geometry";
import { SourceError } from "./sources";

export const JPEG_PREVIEW_QUALITY = 0.85;
export const JPEG_CROP_QUALITY = 0.95;

export function createCanvas(width: number, height: number): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const context = canvas.getContext("2d");
  if (!context) {
    canvas.width = 0;
    canvas.height = 0;
    throw new SourceError("render", "Görüntü oluşturulamadı. Tarayıcınız bu işlemi desteklemiyor olabilir.");
  }
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  return { canvas, context };
}

export function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}

export function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob && blob.size > 0 ? resolve(blob) : reject(new SourceError("render", "Görüntü oluşturulamadı."))), "image/jpeg", quality);
  });
}

export function placeRotated(context: CanvasRenderingContext2D, image: CanvasImageSource, sourceWidth: number, sourceHeight: number, rotation: Rotation, scale: number, offsetX: number, offsetY: number): void {
  context.save();
  context.translate(-offsetX, -offsetY);
  if (rotation === 90) {
    context.translate(sourceHeight * scale, 0);
    context.rotate(Math.PI / 2);
  } else if (rotation === 180) {
    context.translate(sourceWidth * scale, sourceHeight * scale);
    context.rotate(Math.PI);
  } else if (rotation === 270) {
    context.translate(0, sourceWidth * scale);
    context.rotate(-Math.PI / 2);
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, sourceWidth * scale, sourceHeight * scale);
  context.restore();
}
