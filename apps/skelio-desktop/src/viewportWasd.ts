import type { OrbitControls } from "three/addons/controls/OrbitControls.js";

export function isTypingInEditableField(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

/**
 * Same mapping as OrbitControls arrow keys: W/S = vertical pan, A/D = horizontal.
 * Uses internal `_pan` to match mouse pan semantics for ortho + perspective.
 */
export function orbitControlsHandleWasd(controls: OrbitControls, e: KeyboardEvent): boolean {
  if (!controls.enabled) return false;
  if (isTypingInEditableField(e.target)) return false;
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  const k = e.key.length === 1 ? e.key.toLowerCase() : "";
  if (k !== "w" && k !== "a" && k !== "s" && k !== "d") return false;
  const speed = controls.keyPanSpeed;
  const pan = controls as unknown as { _pan: (dx: number, dy: number) => void };
  if (k === "w") pan._pan(0, speed);
  else if (k === "s") pan._pan(0, -speed);
  else if (k === "a") pan._pan(speed, 0);
  else pan._pan(-speed, 0);
  controls.update();
  return true;
}
