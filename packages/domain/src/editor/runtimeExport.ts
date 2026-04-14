import { RUNTIME_SCHEMA_VERSION } from "../constants.js";
import { clipDurationSeconds } from "./pose.js";
import type { AnimationClip, Bone, EditorProject, SkinnedMesh } from "./types.js";

/** Runtime JSON shape (validated by schemas/runtime-1.1.0.json). */
export type RuntimeExport = {
  schemaVersion: string;
  meta: {
    name: string;
    fps: number;
    duration: number;
    coordinateSystem: "y-down";
  };
  assets: { id: string; type: "texture"; path: string }[];
  armature: {
    bones: {
      id: string;
      parentId: string | null;
      name: string;
      bindPose: { x: number; y: number; rotation: number; sx: number; sy: number };
      length: number;
    }[];
    attachments: {
      id: string;
      boneId: string;
      assetId: string;
      transform: { x: number; y: number; rotation: number; sx: number; sy: number };
    }[];
  };
  animations: {
    id: string;
    name: string;
    length: number;
    tracks: {
      boneId: string;
      channels: {
        property: "tx" | "ty" | "rot" | "sx" | "sy";
        interpolation: "linear" | "hold";
        keys: { t: number; v: number }[];
      }[];
    }[];
  }[];
  /** 2D skinned meshes (bind space); empty array if none. Since 1.1.0. */
  skins: RuntimeSkinnedMesh[];
};

export type RuntimeSkinnedMesh = {
  id: string;
  name: string;
  vertices: { x: number; y: number }[];
  indices: number[];
  influences: { boneId: string; weight: number }[][];
};

function mapSkinnedMesh(m: SkinnedMesh): RuntimeSkinnedMesh {
  return {
    id: m.id,
    name: m.name,
    vertices: m.vertices.map((v) => ({ x: v.x, y: v.y })),
    indices: [...m.indices],
    influences: m.influences.map((row) => row.map((inf) => ({ boneId: inf.boneId, weight: inf.weight }))),
  };
}

/** Runtime 1.1.0 kennt nur 2D-Kanäle; Editor-Kanäle tz/tilt/spin werden gestrippt (ADR 0011). */
const RUNTIME_CHANNEL_PROPS = new Set(["tx", "ty", "rot", "sx", "sy"]);

function mapClip(clip: AnimationClip, bones: Bone[]): RuntimeExport["animations"][0] {
  const length = clipDurationSeconds(clip, bones);
  return {
    id: clip.id,
    name: clip.name,
    length,
    tracks: clip.tracks
      .map((tr) => ({
        boneId: tr.boneId,
        channels: tr.channels
          .filter((ch) => RUNTIME_CHANNEL_PROPS.has(ch.property))
          .map((ch) => ({
            property: ch.property as "tx" | "ty" | "rot" | "sx" | "sy",
            interpolation: ch.interpolation,
            keys: ch.keys.map((k) => ({ t: k.t, v: k.v })),
          })),
      }))
      .filter((tr) => tr.channels.length > 0),
  };
}

export function editorProjectToRuntime(project: EditorProject): RuntimeExport {
  const clip = project.clips.find((c) => c.id === project.activeClipId) ?? project.clips[0]!;
  const duration = clipDurationSeconds(clip, project.bones);
  const meshes = project.skinnedMeshes ?? [];

  return {
    schemaVersion: RUNTIME_SCHEMA_VERSION,
    meta: {
      name: project.meta.name,
      fps: project.meta.fps,
      duration,
      coordinateSystem: "y-down",
    },
    assets: [],
    armature: {
      bones: project.bones.map((b) => ({
        id: b.id,
        parentId: b.parentId,
        name: b.name,
        bindPose: { ...b.bindPose },
        length: b.length,
      })),
      attachments: [],
    },
    animations: project.clips.map((c) => mapClip(c, project.bones)),
    skins: meshes.map(mapSkinnedMesh),
  };
}
