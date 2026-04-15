import type { AnimationClip, ControlChannelProperty, ControlTrack, EditorProject, Keyframe } from "../types.js";

function sampleKeys(keys: Keyframe[], time: number, fallback: number): number {
  if (keys.length === 0) return fallback;
  if (time <= keys[0]!.t) return keys[0]!.v;
  const last = keys[keys.length - 1]!;
  if (time >= last.t) return last.v;
  for (let i = 0; i + 1 < keys.length; i++) {
    const a = keys[i]!;
    const b = keys[i + 1]!;
    if (time >= a.t && time <= b.t) {
      const dt = b.t - a.t;
      if (dt <= 1e-12) return b.v;
      const u = (time - a.t) / dt;
      return a.v + (b.v - a.v) * u;
    }
  }
  return last.v;
}

function getControlTrack(clip: AnimationClip | undefined, controlId: string): ControlTrack | undefined {
  if (!clip) return undefined;
  return clip.controlTracks?.find((t) => t.controlId === controlId);
}

/**
 * Samples a control channel at time. If the channel does not exist, returns fallback.
 */
export function sampleControlChannel(
  clip: AnimationClip | undefined,
  controlId: string,
  property: ControlChannelProperty,
  time: number,
  fallback: number,
): number {
  const tr = getControlTrack(clip, controlId);
  const ch = tr?.channels.find((c) => c.property === property);
  if (!ch) return fallback;
  return sampleKeys(ch.keys, time, fallback);
}

/**
 * Resolve the active clip object.
 */
export function activeClip(project: EditorProject): AnimationClip | undefined {
  return project.clips.find((c) => c.id === project.activeClipId);
}

/**
 * Samples IK target control override for a chain (if present).
 *
 * Order:
 * - enabled ikTargets2d control linked to chainId (base value + animated keys)
 * - none -> null
 */
export function sampleIkTargetOverride2d(
  project: EditorProject,
  chainId: string,
  time: number,
): { x: number; y: number; poleX?: number; poleY?: number } | null {
  const ctl = project.rig?.controls?.ikTargets2d?.find((c) => c.enabled && c.chainId === chainId);
  if (!ctl) return null;
  const clip = activeClip(project);
  const x = sampleControlChannel(clip, ctl.id, "x", time, ctl.x);
  const y = sampleControlChannel(clip, ctl.id, "y", time, ctl.y);
  const poleX =
    ctl.poleX != null ? sampleControlChannel(clip, ctl.id, "poleX", time, ctl.poleX) : undefined;
  const poleY =
    ctl.poleY != null ? sampleControlChannel(clip, ctl.id, "poleY", time, ctl.poleY) : undefined;
  return { x, y, ...(poleX != null && poleY != null ? { poleX, poleY } : {}) };
}

