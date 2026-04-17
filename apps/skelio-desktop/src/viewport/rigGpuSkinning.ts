import * as THREE from "three";
import {
  mat4ToMat2dProjection,
  planar2dClosedFkChainOpts,
  rotationOnly2d,
  worldBindBoneMatrices2D,
  worldBindBoneMatrices4,
  type EditorProject,
  type Mat2D,
  type SkinnedMesh,
  type CharacterRigSpriteSlice,
} from "@skelio/domain";

export type RigGpuSkinningMode = "2d" | "2.5d" | "3d";

const flipY4 = new THREE.Matrix4().set(1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);

function mat4FromMat2d(m: Mat2D): Float64Array {
  return new Float64Array([m.a, m.b, 0, 0, m.c, m.d, 0, 0, 0, 0, 1, 0, m.e, m.f, 0, 1]);
}

function mat4FromDomainToThree(domainM: Float64Array): THREE.Matrix4 {
  const md = new THREE.Matrix4().fromArray(Array.from(domainM));
  return new THREE.Matrix4().multiplyMatrices(flipY4, md).multiply(flipY4);
}

function bindWorldByBoneId(project: EditorProject, mode: RigGpuSkinningMode): Map<string, Float64Array> {
  if (mode === "2d") {
    /** Same planar FK closure as Character Setup bone overlay (`planar2dClosedFkChainOpts`). */
    const m2 = worldBindBoneMatrices2D(project, planar2dClosedFkChainOpts);
    const out = new Map<string, Float64Array>();
    for (const [id, m] of m2) out.set(id, mat4FromMat2d(rotationOnly2d(m)));
    return out;
  }
  return worldBindBoneMatrices4(project);
}

export class RigGpuSkinner {
  private bones: THREE.Bone[] | null = null;
  private boneIndexById: Map<string, number> | null = null;
  private skeleton: THREE.Skeleton | null = null;

  ensureSkeleton(project: EditorProject, root: THREE.Object3D, mode: RigGpuSkinningMode): THREE.Skeleton | null {
    const bones = project.bones;
    if (bones.length === 0) return null;

    if (this.bones) {
      for (const b of this.bones) if (b.parent) b.parent.remove(b);
    }

    const Wbind = bindWorldByBoneId(project, mode);
    const boneObjById = new Map<string, THREE.Bone>();
    for (const b of bones) {
      const o = new THREE.Bone();
      o.name = b.id;
      o.matrixAutoUpdate = false;
      boneObjById.set(b.id, o);
    }

    for (const b of bones) {
      const o = boneObjById.get(b.id)!;
      const parent = b.parentId ? boneObjById.get(b.parentId) : null;
      if (parent) parent.add(o);
      else root.add(o);
    }

    const WthreeById = new Map<string, THREE.Matrix4>();
    for (const b of bones) {
      const m = Wbind.get(b.id);
      if (!m) continue;
      WthreeById.set(b.id, mat4FromDomainToThree(m));
    }

    for (const b of bones) {
      const o = boneObjById.get(b.id)!;
      const w = WthreeById.get(b.id);
      if (!w) continue;
      if (b.parentId) {
        const pw = WthreeById.get(b.parentId);
        if (pw) o.matrix.copy(pw.clone().invert().multiply(w));
        else o.matrix.copy(w);
      } else {
        o.matrix.copy(w);
      }
    }

    for (const b of bones) boneObjById.get(b.id)!.updateMatrixWorld(true);

    const boneList = bones.map((b) => boneObjById.get(b.id)!);
    const inverses = boneList.map((o) => o.matrixWorld.clone().invert());

    this.bones = boneList;
    this.boneIndexById = new Map(bones.map((b, i) => [b.id, i] as const));
    this.skeleton = new THREE.Skeleton(boneList, inverses);
    return this.skeleton;
  }

  updateFromPoseWorld(project: EditorProject, poseWorld4ByBoneId: Map<string, Float64Array>, mode: RigGpuSkinningMode) {
    if (!this.skeleton || !this.bones || !this.boneIndexById) return;
    const bones = project.bones;

    const WthreeById = new Map<string, THREE.Matrix4>();
    if (mode === "2d") {
      for (const b of bones) {
        const m = poseWorld4ByBoneId.get(b.id);
        if (!m) continue;
        const m2 = mat4ToMat2dProjection(m);
        const r2 = rotationOnly2d(m2);
        const r4 = mat4FromMat2d(r2);
        WthreeById.set(b.id, mat4FromDomainToThree(r4));
      }
    } else {
      for (const b of bones) {
        const m = poseWorld4ByBoneId.get(b.id);
        if (!m) continue;
        WthreeById.set(b.id, mat4FromDomainToThree(m));
      }
    }

    for (const b of bones) {
      const idx = this.boneIndexById.get(b.id);
      if (idx == null) continue;
      const o = this.bones[idx]!;
      const w = WthreeById.get(b.id);
      if (!w) continue;
      if (b.parentId) {
        const pw = WthreeById.get(b.parentId);
        if (pw) o.matrix.copy(pw.clone().invert().multiply(w));
        else o.matrix.copy(w);
      } else {
        o.matrix.copy(w);
      }
    }

    for (const o of this.bones) o.updateMatrixWorld(true);
    this.skeleton.update();
  }

  buildSliceGeometry(slice: CharacterRigSpriteSlice, mesh: SkinnedMesh): THREE.BufferGeometry | null {
    if (!this.boneIndexById) return null;
    const verts = mesh.vertices;
    const idx = mesh.indices;
    if (!verts.length || !idx.length) return null;

    const pos = new Float32Array(verts.length * 3);
    const uv = new Float32Array(verts.length * 2);
    const skinIndex = new Uint16Array(verts.length * 4);
    const skinWeight = new Float32Array(verts.length * 4);

    const cx = slice.worldCx;
    const cy = slice.worldCy;
    const hw = slice.width / 2;
    const hh = slice.height / 2;
    const invW = 1 / Math.max(1e-6, slice.width);
    const invH = 1 / Math.max(1e-6, slice.height);

    for (let i = 0; i < verts.length; i++) {
      const v = verts[i]!;
      pos[i * 3 + 0] = v.x;
      pos[i * 3 + 1] = -v.y;
      pos[i * 3 + 2] = 0;
      const u0 = (v.x - (cx - hw)) * invW;
      const v0 = (v.y - (cy - hh)) * invH;
      uv[i * 2 + 0] = Math.min(1, Math.max(0, u0));
      uv[i * 2 + 1] = 1 - Math.min(1, Math.max(0, v0));

      const infl = mesh.influences[i] ?? [];
      let wsum = 0;
      for (let k = 0; k < 4; k++) {
        const inf = infl[k];
        if (!inf) break;
        skinIndex[i * 4 + k] = this.boneIndexById.get(inf.boneId) ?? 0;
        const w = Math.max(0, inf.weight);
        skinWeight[i * 4 + k] = w;
        wsum += w;
      }
      if (wsum > 1e-9) {
        for (let k = 0; k < 4; k++) skinWeight[i * 4 + k] /= wsum;
      } else {
        skinIndex[i * 4 + 0] = 0;
        skinWeight[i * 4 + 0] = 1;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geo.setAttribute("skinIndex", new THREE.BufferAttribute(skinIndex, 4));
    geo.setAttribute("skinWeight", new THREE.BufferAttribute(skinWeight, 4));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }
}

