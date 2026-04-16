import type { CharacterRigBinding, CharacterRigConfig, CharacterRigSpriteSlice, EditorProject, SkinnedMesh } from "./types.js";
import { mat4Invert, transformPointMat4 } from "./mat4.js";
import { worldBindBoneMatrices4 } from "./bone3dPose.js";
import {
  bindingsCompleteLenientForRig,
  bindingsCompleteStrictForRig,
  getCharacterRig,
  iterCharacterRigs,
  resolveDefaultCharacterId,
} from "./characterSlots.js";

/** Stable id for meshes generated from Character Rig slices (`syncCharacterRigSkinnedMeshes`). */
export const RIG_SLICE_MESH_ID_PREFIX = "rig_slice_";

export function rigSliceSkinnedMeshId(sliceId: string): string {
  return `${RIG_SLICE_MESH_ID_PREFIX}${sliceId}`;
}

/** Bound bone for a slice: only a valid `bindings` row on any character rig (no mesh inference). */
export function resolveCharacterRigSliceBoundBoneId(project: EditorProject, sliceId: string): string | null {
  const boneIds = new Set(project.bones.map((b) => b.id));
  for (const rig of iterCharacterRigs(project)) {
    const fromBinding = rig.bindings?.find((b) => b.sliceId === sliceId)?.boneId;
    if (fromBinding && boneIds.has(fromBinding)) return fromBinding;
  }
  return null;
}

/**
 * True when every character rig that has pixel slices has them fully bound (multi-rig safe).
 * Used to gate automatic mesh sync / persistence.
 */
export function characterRigBindingsComplete(project: EditorProject): boolean {
  for (const rig of iterCharacterRigs(project)) {
    if (!bindingsCompleteLenientForRig(rig, project.bones)) return false;
  }
  return true;
}

/**
 * Wizard-style completeness for one character: at least one pixel slice and every pixel slice bound.
 */
export function characterRigBindingsCompleteStrict(project: EditorProject, characterId?: string): boolean {
  const rig = getCharacterRig(project, characterId ?? resolveDefaultCharacterId(project));
  if (!rig) return false;
  return bindingsCompleteStrictForRig(rig, project.bones);
}

function influenceRow(boneId: string): { boneId: string; weight: number }[] {
  return [{ boneId, weight: 1 }];
}

/**
 * Adaptive grid density along one axis (world px). Spine/Smack use dense meshes; we start from a
 * uniform grid so deformation is not a single stretched quad.
 */
function gridSegmentCount(span: number): number {
  if (!Number.isFinite(span) || span <= 0) return 3;
  const cells = Math.ceil(span / 44);
  return Math.max(3, Math.min(14, cells));
}

export type EdgeMargins = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

/**
 * 100% AUTOMATISCH: Berechnet Margins basierend auf Geometrie.
 * - Distanz zum Joint + 30% Buffer
 * - Mindestens 25% der Slice-Dimension in Richtung des Joints
 * - Minimaler Rand = 2% der Slice-Dimension
 * 
 * KEINE HARDCODED PIXEL-WERTE.
 */
export function computeDirectedEdgeMargins(
  sliceCx: number,
  sliceCy: number,
  sliceW: number,
  sliceH: number,
  jointPositions: { x: number; y: number }[],
): EdgeMargins {
  // Automatische Basis-Margins: 2% der jeweiligen Dimension
  const baseMarginH = sliceW * 0.02;
  const baseMarginV = sliceH * 0.02;
  
  const margins: EdgeMargins = {
    left: baseMarginH,
    right: baseMarginH,
    top: baseMarginV,
    bottom: baseMarginV,
  };

  if (jointPositions.length === 0) return margins;

  const hw = sliceW / 2;
  const hh = sliceH / 2;
  const sliceLeft = sliceCx - hw;
  const sliceRight = sliceCx + hw;
  const sliceTop = sliceCy - hh;
  const sliceBottom = sliceCy + hh;

  // Minimale Extension: 2% (nur für Overlap, kein Gap-Fill)
  const minJointMarginH = sliceW * 0.02;
  const minJointMarginV = sliceH * 0.02;

  for (const jp of jointPositions) {
    // Distanz vom Joint zu jeder Slice-Kante
    const distToLeft = sliceLeft - jp.x;
    const distToRight = jp.x - sliceRight;
    const distToTop = sliceTop - jp.y;
    const distToBottom = jp.y - sliceBottom;

    // Kein Buffer - nur exakte Distanz wenn Joint außerhalb liegt
    const bufferFactor = 1.0;

    // Erweitere Kante zum Joint: Distanz * 1.3 (30% Buffer)
    if (distToLeft > 0) {
      margins.left = Math.max(margins.left, distToLeft * bufferFactor);
    }
    if (distToRight > 0) {
      margins.right = Math.max(margins.right, distToRight * bufferFactor);
    }
    if (distToTop > 0) {
      margins.top = Math.max(margins.top, distToTop * bufferFactor);
    }
    if (distToBottom > 0) {
      margins.bottom = Math.max(margins.bottom, distToBottom * bufferFactor);
    }

    // IMMER: Mindest-Extension (25% der Slice-Größe) in Richtung des Joints
    const dx = jp.x - sliceCx;
    const dy = jp.y - sliceCy;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) margins.left = Math.max(margins.left, minJointMarginH);
      else margins.right = Math.max(margins.right, minJointMarginH);
    } else {
      if (dy < 0) margins.top = Math.max(margins.top, minJointMarginV);
      else margins.bottom = Math.max(margins.bottom, minJointMarginV);
    }
  }

  return margins;
}

function buildSubdividedRectMesh2d(
  cx: number,
  cy: number,
  hw: number,
  hh: number,
  boneId: string,
  margins: EdgeMargins,
  yOffset = 0,
): Pick<SkinnedMesh, "vertices" | "indices" | "influences"> {
  const xMin = cx - hw - margins.left;
  const xMax = cx + hw + margins.right;
  const yMin = cy - hh - margins.top;
  const yMax = cy + hh + margins.bottom;
  const spanX = xMax - xMin;
  const spanY = yMax - yMin;
  const su = gridSegmentCount(spanX);
  const sv = gridSegmentCount(spanY);
  const infl = influenceRow(boneId);
  const verts: { x: number; y: number }[] = [];
  for (let j = 0; j <= sv; j++) {
    const v = j / sv;
    const y = yMin + v * spanY + yOffset;
    for (let i = 0; i <= su; i++) {
      const u = i / su;
      const x = xMin + u * spanX;
      verts.push({ x, y });
    }
  }
  const influences = verts.map(() => infl);
  const indices: number[] = [];
  const row = su + 1;
  for (let j = 0; j < sv; j++) {
    for (let i = 0; i < su; i++) {
      const bl = i + j * row;
      const br = bl + 1;
      const tl = bl + row;
      const tr = tl + 1;
      indices.push(bl, br, tr, bl, tr, tl);
    }
  }
  return { vertices: verts, indices, influences };
}

/** Zwei parallele Unterflächen (front/back) wie bisher 8 Vertices — jetzt jeweils unterteilt. */
function buildSubdividedDepthSliceMesh2d(
  cx: number,
  cy: number,
  hw: number,
  hh: number,
  boneId: string,
  margins: EdgeMargins,
  fy: number,
  by: number,
): Pick<SkinnedMesh, "vertices" | "indices" | "influences"> {
  const front = buildSubdividedRectMesh2d(cx, cy, hw, hh, boneId, margins, fy);
  const back = buildSubdividedRectMesh2d(cx, cy, hw, hh, boneId, margins, by);
  const base = front.vertices.length;
  const vertices = [...front.vertices, ...back.vertices];
  const influences = [...front.influences, ...back.influences];
  const indices = [...front.indices, ...back.indices.map((i) => i + base)];
  return { vertices, indices, influences };
}

/**
 * Builds one skinned mesh per slice that has pixel size and a bone binding.
 * Flat slices: **subdivided grid** on the slice AABB (Spine-like first step vs a single quad).
 * If `maxDepthFront` / `maxDepthBack` are set (see {@link CharacterRigSliceDepth}), uses two subdivided
 * faces (front/back offset in Y), same grid density as flat slices — not a bare 8-vertex box.
 *
 * Now with **directed edge extension**: mesh edges facing parent/child joints get larger
 * margins to close gaps at bends; other edges get minimal margin.
 */
function skinnedMeshesFromOneRig(project: EditorProject, rig: CharacterRigConfig): SkinnedMesh[] {
  if (!rig?.slices?.length) return [];

  const bindingBySlice = new Map((rig.bindings ?? []).map((b) => [b.sliceId, b] as const));
  const out: SkinnedMesh[] = [];
  const Wbind4 = worldBindBoneMatrices4(project);

  const boneById = new Map(project.bones.map((b) => [b.id, b] as const));
  const childBoneIds = new Map<string, string[]>();
  for (const b of project.bones) {
    if (b.parentId) {
      const arr = childBoneIds.get(b.parentId) ?? [];
      arr.push(b.id);
      childBoneIds.set(b.parentId, arr);
    }
  }

  for (const s of rig.slices) {
    if (s.width <= 0 || s.height <= 0) continue;
    const binding = bindingBySlice.get(s.id) as CharacterRigBinding | undefined;
    const boneId = binding?.boneId;
    if (!boneId) continue;

    const depth = rig.sliceDepths?.find((d) => d.sliceId === s.id);
    const df = Math.max(0, depth?.maxDepthFront ?? 0);
    const dbRaw = depth?.syncBackWithFront ? df : Math.max(0, depth?.maxDepthBack ?? 0);
    const db = depth?.syncBackWithFront ? df : dbRaw;

    const bone = boneById.get(boneId);
    const jointPositions: { x: number; y: number }[] = [];

    if (bone?.parentId) {
      const parentM = Wbind4.get(bone.parentId);
      const parentBone = boneById.get(bone.parentId);
      if (parentM && parentBone) {
        const parentTip = transformPointMat4(parentM, parentBone.length, 0, 0);
        jointPositions.push({ x: parentTip.x, y: parentTip.y });
      }
    }

    const children = childBoneIds.get(boneId) ?? [];
    for (const cid of children) {
      const childM = Wbind4.get(cid);
      if (childM) {
        const childJoint = transformPointMat4(childM, 0, 0, 0);
        jointPositions.push({ x: childJoint.x, y: childJoint.y });
      }
    }

    const mesh = sliceToSkinnedMesh(s, binding, Wbind4.get(boneId) ?? null, df, db, jointPositions);
    out.push(mesh);
  }

  return out;
}

export function skinnedMeshesFromCharacterRig(project: EditorProject): SkinnedMesh[] {
  const out: SkinnedMesh[] = [];
  for (const rig of iterCharacterRigs(project)) {
    out.push(...skinnedMeshesFromOneRig(project, rig));
  }
  return out;
}

function sliceToSkinnedMesh(
  s: CharacterRigSpriteSlice,
  binding: CharacterRigBinding,
  Wbind4: Float64Array | null,
  maxDepthFront: number,
  maxDepthBack: number,
  jointPositions: { x: number; y: number }[],
): SkinnedMesh {
  // Use the same anchor semantics as rigidCharacterRigSliceWorldPose:
  // center the mesh at the binding anchor in bind-local space (default sliceCenter).
  let cx = s.worldCx;
  let cy = s.worldCy;
  const ax = binding.localX;
  const ay = binding.localY;
  const az = binding.localZ ?? 0;
  if (Wbind4 && ax != null && ay != null) {
    const wp = transformPointMat4(Wbind4, ax, ay, az);
    cx = wp.x;
    cy = wp.y;
  } else if (Wbind4) {
    // Backwards compat: if locals are missing, derive them from the slice layout center at bind.
    const inv = mat4Invert(Wbind4);
    if (inv) {
      const loc = transformPointMat4(inv, s.worldCx, s.worldCy, 0);
      const wp = transformPointMat4(Wbind4, loc.x, loc.y, 0);
      cx = wp.x;
      cy = wp.y;
    }
  }
  const hw = s.width / 2;
  const hh = s.height / 2;
  const id = rigSliceSkinnedMeshId(s.id);
  const name = `rig_${s.name.replace(/\s+/g, "_")}`;

  const margins = computeDirectedEdgeMargins(cx, cy, s.width, s.height, jointPositions);

  const hasDepth = maxDepthFront > 1e-6 || maxDepthBack > 1e-6;

  if (!hasDepth) {
    const grid = buildSubdividedRectMesh2d(cx, cy, hw, hh, binding.boneId, margins);
    return {
      id,
      name,
      vertices: grid.vertices,
      indices: grid.indices,
      influences: grid.influences,
    };
  }

  const fy = -maxDepthFront;
  const by = maxDepthBack;
  const depthMesh = buildSubdividedDepthSliceMesh2d(cx, cy, hw, hh, binding.boneId, margins, fy, by);
  return {
    id,
    name,
    vertices: depthMesh.vertices,
    indices: depthMesh.indices,
    influences: depthMesh.influences,
  };
}
