import type { SkinInfluence } from "./types.js";

const MAX_INFLUENCES = 8;

/**
 * Merges duplicate bones, drops unknown ids, clamps to ≥0, keeps at most eight influences,
 * and scales down if the sum exceeds 1.
 */
export function sanitizeInfluenceRow(influences: SkinInfluence[], boneIds: Set<string>): SkinInfluence[] {
  const map = new Map<string, number>();
  for (const inf of influences) {
    if (!boneIds.has(inf.boneId)) continue;
    if (!Number.isFinite(inf.weight) || inf.weight <= 0) continue;
    map.set(inf.boneId, (map.get(inf.boneId) ?? 0) + inf.weight);
  }
  let rows: SkinInfluence[] = [...map.entries()].map(([boneId, weight]) => ({ boneId, weight }));
  rows.sort((a, b) => b.weight - a.weight);
  rows = rows.slice(0, MAX_INFLUENCES);
  rows.sort((a, b) => a.boneId.localeCompare(b.boneId));
  let sum = rows.reduce((s, x) => s + x.weight, 0);
  if (sum > 1 + 1e-9) {
    const f = 1 / sum;
    rows = rows.map((x) => ({ boneId: x.boneId, weight: x.weight * f }));
  }
  return rows;
}

/** Scales non-negative weights so their sum is 1, or returns empty if sum is 0. */
export function normalizeInfluenceRow(influences: SkinInfluence[], boneIds: Set<string>): SkinInfluence[] {
  const cleaned = influences.filter(
    (x) => boneIds.has(x.boneId) && Number.isFinite(x.weight) && x.weight > 0,
  );
  const map = new Map<string, number>();
  for (const inf of cleaned) {
    map.set(inf.boneId, (map.get(inf.boneId) ?? 0) + inf.weight);
  }
  let rows: SkinInfluence[] = [...map.entries()].map(([boneId, weight]) => ({ boneId, weight }));
  rows.sort((a, b) => b.weight - a.weight);
  rows = rows.slice(0, MAX_INFLUENCES);
  rows.sort((a, b) => a.boneId.localeCompare(b.boneId));
  const sum = rows.reduce((s, x) => s + x.weight, 0);
  if (sum <= 1e-12) return [];
  return rows.map((x) => ({ boneId: x.boneId, weight: x.weight / sum }));
}

/** Adds `delta` to `boneId` (clamped per weight 0–1), then re-sanitizes the row. */
export function addBoneWeightDelta(
  row: SkinInfluence[],
  boneId: string,
  delta: number,
  boneIds: Set<string>,
): SkinInfluence[] {
  if (!boneIds.has(boneId) || !Number.isFinite(delta)) return sanitizeInfluenceRow(row, boneIds);
  const map = new Map<string, number>();
  for (const inf of row) {
    if (!boneIds.has(inf.boneId)) continue;
    if (!Number.isFinite(inf.weight) || inf.weight <= 0) continue;
    map.set(inf.boneId, inf.weight);
  }
  const cur = map.get(boneId) ?? 0;
  const clamped = Math.max(0, Math.min(1, cur + delta));
  if (clamped <= 1e-9) map.delete(boneId);
  else map.set(boneId, clamped);
  return sanitizeInfluenceRow([...map.entries()].map(([b, w]) => ({ boneId: b, weight: w })), boneIds);
}
