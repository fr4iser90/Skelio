/**
 * Shared WebGL bone overlay (cylinders + joints) for Character Setup and Animate viewports.
 * Single implementation avoids drift between the two Three.js viewports.
 */
import * as THREE from "three";
import {
  BONE_LENGTH_HIT_MIN_LOCAL,
  transformPointMat4,
  type Bone,
  type Mat4,
} from "@skelio/domain";
import { boneShaftSegmentsWorld2D } from "../boneShaftSegments.js";

export function rigBoneVisualThicknessScale(Lvis: number): number {
  const ref = 88;
  return Math.min(1.12, Math.max(0.26, Lvis / ref));
}

/**
 * @param effectiveLength — e.g. bind `length` or live length-drag preview (`CharacterRig`).
 */
export function lengthForBoneVisual(
  b: Bone,
  selectedId: string | null,
  rigBoneInteractive: boolean,
  effectiveLength: (bone: Bone) => number,
): number {
  const L = effectiveLength(b);
  if (rigBoneInteractive && b.id === selectedId && L < 1e-6) {
    return BONE_LENGTH_HIT_MIN_LOCAL;
  }
  return L;
}

export function clearBoneMeshGroups(
  boneLines: THREE.Group,
  boneJoints: THREE.Group,
  keepMaterials: ReadonlySet<THREE.Material>,
): void {
  for (const g of [boneLines, boneJoints]) {
    while (g.children.length) {
      const o = g.children[0]!;
      g.remove(o);
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const m = o.material;
        if (Array.isArray(m)) {
          m.forEach((mat) => {
            if (!keepMaterials.has(mat)) mat.dispose();
          });
        } else if (!keepMaterials.has(m)) m.dispose();
      }
    }
  }
}

export type RebuildBoneOverlayMeshesOpts = {
  boneLines: THREE.Group;
  boneJoints: THREE.Group;
  /** Do not dispose these (reused every frame). */
  keepMaterials: ReadonlySet<THREE.Material>;
  bonesList: readonly Bone[];
  boneM4: Map<string, Mat4>;
  boneO: Map<string, { x: number; y: number }>;
  selectedBoneId: string | null;
  rigBoneInteractive: boolean;
  lengthPreviewBoneId: string | null;
  effectiveLength: (bone: Bone) => number;
  matBone: THREE.MeshStandardMaterial;
  matBoneSel: THREE.MeshStandardMaterial;
  matJoint: THREE.MeshBasicMaterial;
  matJointSel: THREE.MeshBasicMaterial;
  /**
   * When true, shaft uses selection material only if `rigBoneInteractive` (Character Setup steps 1–3).
   * When false (Animate), any selected bone gets shaft highlight.
   */
  shaftHighlightRequiresInteractive: boolean;
  shaftRenderOrder?: number;
  jointRenderOrder?: number;
};

export function rebuildBoneOverlayMeshes(o: RebuildBoneOverlayMeshesOpts): void {
  clearBoneMeshGroups(o.boneLines, o.boneJoints, o.keepMaterials);
  const selBid = o.selectedBoneId;
  const shaftRO = o.shaftRenderOrder ?? 3;
  const jointRO = o.jointRenderOrder ?? 4;

  for (const b of o.bonesList) {
    const Lvis = lengthForBoneVisual(b, selBid, o.rigBoneInteractive, o.effectiveLength);
    if (Lvis <= 1e-9) continue;
    const M4 = o.boneM4.get(b.id);
    if (!M4) continue;
    const segs = boneShaftSegmentsWorld2D(b, o.bonesList, o.boneM4, o.boneO, Lvis, {
      lengthPreviewBoneId: o.lengthPreviewBoneId,
    });
    const shaftSel =
      b.id === selBid && (!o.shaftHighlightRequiresInteractive || o.rigBoneInteractive);
    const ts = rigBoneVisualThicknessScale(Math.max(Lvis, 1));
    const r = (shaftSel ? 8 : 6) * ts;
    for (const seg of segs) {
      const p0w = transformPointMat4(M4, 0, 0, 0);
      const a = new THREE.Vector3(seg.ax, -seg.ay, p0w.z);
      const c = new THREE.Vector3(seg.bx, -seg.by, p0w.z);
      const dir = c.clone().sub(a);
      const len = dir.length();
      if (len <= 1e-9) continue;
      dir.multiplyScalar(1 / len);
      const mid = a.clone().add(c).multiplyScalar(0.5);
      const geo = new THREE.CylinderGeometry(r, r * 0.96, len, 14, 1, false);
      const mesh = new THREE.Mesh(geo, shaftSel ? o.matBoneSel : o.matBone);
      mesh.position.copy(mid);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      mesh.renderOrder = shaftRO;
      mesh.userData = { kind: "bone", boneId: b.id };
      o.boneLines.add(mesh);
    }
  }

  for (const b of o.bonesList) {
    const M4 = o.boneM4.get(b.id);
    if (!M4) continue;
    const p0 = transformPointMat4(M4, 0, 0, 0);
    const jointSel = b.id === selBid;
    const Lvj = lengthForBoneVisual(b, selBid, o.rigBoneInteractive, o.effectiveLength);
    const ts = rigBoneVisualThicknessScale(Math.max(Lvj, 1));
    const r = (jointSel ? 8.5 : 6.5) * ts;
    const geo = new THREE.SphereGeometry(r, 16, 12);
    const mesh = new THREE.Mesh(geo, jointSel ? o.matJointSel : o.matJoint);
    mesh.position.set(p0.x, -p0.y, p0.z);
    mesh.renderOrder = jointRO;
    mesh.userData = { kind: "bone", boneId: b.id };
    o.boneJoints.add(mesh);
  }
}
