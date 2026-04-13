const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp"]);

/** `accept` for `<input type="file">` — PNG, JPEG, WebP (raster). */
export const REFERENCE_IMAGE_ACCEPT_ATTR =
  "image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp";

export function normalizeReferenceImageMime(mime: string): string | null {
  const m = mime.trim().toLowerCase();
  if (m === "image/jpg") return "image/jpeg";
  if (ALLOWED.has(m)) return m;
  return null;
}

/** When `File.type` is empty, infer from extension (leading dot optional). */
export function mimeFromFileName(fileName: string): string | null {
  const lower = fileName.toLowerCase();
  const dot = lower.lastIndexOf(".");
  const ext = dot >= 0 ? lower.slice(dot + 1) : "";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  return null;
}
