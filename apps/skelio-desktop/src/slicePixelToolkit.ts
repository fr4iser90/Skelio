/**
 * Browser-only helpers for Character Rig sprite editing (Smack-style front/back).
 */
import type { CharacterRigSliceEmbeddedImage, EditorProject } from "@skelio/domain";

function dataUrlToEmbedded(mime: string, dataUrl: string, w: number, h: number): CharacterRigSliceEmbeddedImage {
  const m = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
  const dataBase64 = m ? m[1]!.replace(/\s/g, "") : "";
  return { mimeType: mime, dataBase64, pixelWidth: w, pixelHeight: h };
}

/** Crop sprite sheet / embedded to canvas ImageData (same size as slice). */
export async function rasterizeSliceToImageData(
  project: EditorProject,
  sliceId: string,
): Promise<{ w: number; h: number; data: ImageData } | null> {
  const rig = project.characterRig;
  const s = rig?.slices?.find((x) => x.id === sliceId);
  if (!s || s.width <= 0 || s.height <= 0) return null;

  if (s.embedded?.dataBase64 && s.embedded.mimeType) {
    const img = await loadImage(`data:${s.embedded.mimeType};base64,${s.embedded.dataBase64}`);
    const c = document.createElement("canvas");
    c.width = s.width;
    c.height = s.height;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, s.width, s.height);
    return { w: s.width, h: s.height, data: ctx.getImageData(0, 0, s.width, s.height) };
  }

  if (s.sheetId) {
    const sh = rig?.spriteSheets?.find((x) => x.id === s.sheetId);
    if (!sh?.dataBase64 || !sh.mimeType) return null;
    const img = await loadImage(`data:${sh.mimeType};base64,${sh.dataBase64}`);
    const c = document.createElement("canvas");
    c.width = s.width;
    c.height = s.height;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, s.x, s.y, s.width, s.height, 0, 0, s.width, s.height);
    return { w: s.width, h: s.height, data: ctx.getImageData(0, 0, s.width, s.height) };
  }

  return null;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image decode"));
    img.src = src;
  });
}

export function imageDataToPngEmbedded(data: ImageData): CharacterRigSliceEmbeddedImage {
  const c = document.createElement("canvas");
  c.width = data.width;
  c.height = data.height;
  const ctx = c.getContext("2d");
  if (!ctx) {
    return {
      mimeType: "image/png",
      dataBase64: "",
      pixelWidth: data.width,
      pixelHeight: data.height,
    };
  }
  ctx.putImageData(data, 0, 0);
  const dataUrl = c.toDataURL("image/png");
  return dataUrlToEmbedded("image/png", dataUrl, data.width, data.height);
}

export function clearImageDataTransparent(data: ImageData): void {
  data.data.fill(0);
}

export function flipImageDataHorizontal(data: ImageData): void {
  const w = data.width;
  const h = data.height;
  const d = data.data;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < Math.floor(w / 2); x++) {
      const x2 = w - 1 - x;
      const i = row + x * 4;
      const j = row + x2 * 4;
      for (let k = 0; k < 4; k++) {
        const t = d[i + k]!;
        d[i + k] = d[j + k]!;
        d[j + k] = t;
      }
    }
  }
}

/** Copy front raster to back (same dimensions). */
export async function buildEmbeddedBackFromFront(
  project: EditorProject,
  sliceId: string,
): Promise<CharacterRigSliceEmbeddedImage | null> {
  const front = await rasterizeSliceToImageData(project, sliceId);
  if (!front) return null;
  return imageDataToPngEmbedded(front.data);
}

