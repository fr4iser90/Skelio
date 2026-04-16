/**
 * Browser-only helpers for Character Setup wizard sprite editing.
 */
import { findSliceInCharacterRigs } from "@skelio/domain";
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
  const found = findSliceInCharacterRigs(project, sliceId);
  const rig = found?.rig;
  const s = found?.slice;
  if (!rig || !s || s.width <= 0 || s.height <= 0) return null;

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

/**
 * Heuristische Depth-Heightmap aus Sprite-RGBA (heller + deckender → höher).
 * Näherung an „Regenerate“-Workflow — kein ML.
 */
export function proceduralDepthFromAlbedoImageData(src: ImageData): ImageData {
  const w = src.width;
  const h = src.height;
  const s = src.data;
  const out = new ImageData(w, h);
  const d = out.data;
  for (let i = 0; i < s.length; i += 4) {
    const a = s[i + 3]! / 255;
    const r = s[i]!;
    const g = s[i + 1]!;
    const b = s[i + 2]!;
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    let v = 0;
    if (a > 0.04) {
      v = Math.round(55 + (0.45 * lum + 0.55 * a) * 200);
      v = Math.max(0, Math.min(255, v));
    }
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
    d[i + 3] = 255;
  }
  return out;
}

/** Back-Layer-Pixel für Depth, falls vorhanden; sonst `null` (Caller nutzt Front). */
export async function rasterizeSliceBackToImageData(
  project: EditorProject,
  sliceId: string,
): Promise<{ w: number; h: number; data: ImageData } | null> {
  const found = findSliceInCharacterRigs(project, sliceId);
  const s = found?.slice;
  if (!s || s.width <= 0 || s.height <= 0) return null;
  if (!s.embeddedBack?.dataBase64 || !s.embeddedBack.mimeType) return null;
  const img = await loadImage(`data:${s.embeddedBack.mimeType};base64,${s.embeddedBack.dataBase64}`);
  const c = document.createElement("canvas");
  c.width = s.width;
  c.height = s.height;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, s.width, s.height);
  return { w: s.width, h: s.height, data: ctx.getImageData(0, 0, s.width, s.height) };
}

/** PNG-Payload für `setCharacterRigSliceDepthTexture` aus aktuellem Sprite (Front- oder Back-Pixel). */
export async function generateRegeneratedDepthTexturePayload(
  project: EditorProject,
  sliceId: string,
  side: "front" | "back",
): Promise<CharacterRigSliceEmbeddedImage | null> {
  const src =
    side === "back"
      ? (await rasterizeSliceBackToImageData(project, sliceId)) ??
        (await rasterizeSliceToImageData(project, sliceId))
      : await rasterizeSliceToImageData(project, sliceId);
  if (!src) return null;
  const depth = proceduralDepthFromAlbedoImageData(src.data);
  return imageDataToPngEmbedded(depth);
}

