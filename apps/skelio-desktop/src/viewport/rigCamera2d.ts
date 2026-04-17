import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export function applyRigCamera2d(opts: {
  controls: OrbitControls;
  perspCamera: THREE.PerspectiveCamera;
  orthoCamera: THREE.OrthographicCamera;
  element: HTMLElement;
  /** World-space vertical half-extent shown in 2D. */
  halfHeightWorld?: number;
  /** Reset pan/zoom to canonical 2D framing. */
  resetView?: boolean;
}) {
  const { controls, orthoCamera, element } = opts;
  const w = element.clientWidth;
  const h = element.clientHeight;
  const aspect = w / Math.max(h, 1);

  orthoCamera.position.set(0, 0, 1800);
  orthoCamera.lookAt(0, 0, 0);
  if (opts.resetView) {
    controls.target.set(0, 0, 0);
    orthoCamera.zoom = 1;
  }
  const halfH = opts.halfHeightWorld ?? 420;
  const halfW = halfH * aspect;
  orthoCamera.left = -halfW;
  orthoCamera.right = halfW;
  orthoCamera.top = halfH;
  orthoCamera.bottom = -halfH;
  orthoCamera.near = 0.1;
  orthoCamera.far = 8000;
  orthoCamera.updateProjectionMatrix();

  controls.object = orthoCamera;
  controls.enableRotate = false;
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.PAN,
    MIDDLE: THREE.MOUSE.PAN,
    RIGHT: THREE.MOUSE.PAN,
  };
  controls.minPolarAngle = Math.PI / 2;
  controls.maxPolarAngle = Math.PI / 2;
  controls.minAzimuthAngle = 0;
  controls.maxAzimuthAngle = 0;
  controls.update();
}

