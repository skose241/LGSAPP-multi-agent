export const CROP_LONG_EDGE = 2000;
export const CROP_MIN_SHORT_EDGE = 200;
export const CROP_MAX_PIXELS = 16_000_000;
export const CROP_MAX_EDGE = 4000;

export interface CropPlan {
  ok: true;
  scale: number;
  width: number;
  height: number;
}

export interface CropPlanFailure {
  ok: false;
  reason: "tooSmall" | "tooThin";
  message: string;
}

export interface CropPlanOptions {
  maxScale?: number;
}

export function planCrop(cropWidth: number, cropHeight: number, options: CropPlanOptions = {}): CropPlan | CropPlanFailure {
  if (!(cropWidth > 0) || !(cropHeight > 0)) {
    return { ok: false, reason: "tooSmall", message: "Çerçeve çok küçük." };
  }
  const longest = Math.max(cropWidth, cropHeight);
  const shortest = Math.min(cropWidth, cropHeight);
  let scale = CROP_LONG_EDGE / longest;
  if (options.maxScale !== undefined) scale = Math.min(scale, options.maxScale);
  if (shortest * scale < CROP_MIN_SHORT_EDGE) {
    if (options.maxScale !== undefined) {
      return { ok: false, reason: "tooSmall", message: "Çerçeve çok küçük. Kısa kenarı en az 200 piksel olacak şekilde büyütün." };
    }
    scale = CROP_MIN_SHORT_EDGE / shortest;
  }
  if (cropWidth * cropHeight * scale * scale > CROP_MAX_PIXELS) {
    scale = Math.sqrt(CROP_MAX_PIXELS / (cropWidth * cropHeight));
  }
  if (shortest * scale < CROP_MIN_SHORT_EDGE - 0.5 || longest * scale > CROP_MAX_EDGE + 0.5) {
    return { ok: false, reason: "tooThin", message: "Çerçeve çok ince. Daha dengeli bir alan çizin." };
  }
  return { ok: true, scale, width: Math.max(1, Math.round(cropWidth * scale)), height: Math.max(1, Math.round(cropHeight * scale)) };
}
