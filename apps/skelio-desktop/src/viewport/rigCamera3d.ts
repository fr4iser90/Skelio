import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export function applyRigCamera3d(opts: {
  controls: OrbitControls;
  perspCamera: THREE.PerspectiveCamera;
  orthoCamera: THREE.OrthographicCamera;
  element: HTMLElement;
}) {
  const { controls, perspCamera, element } = opts;
  const w = element.clientWidth;
  const h = element.clientHeight;
  perspCamera.aspect = w / Math.max(h, 1);
  perspCamera.near = 0.5;
  perspCamera.far = 50000;
  perspCamera.updateProjectionMatrix();

  controls.object = perspCamera;
  controls.enableRotate = true;
  controls.enablePan = true;
  controls.enableZoom = true;
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.PAN,
    MIDDLE: THREE.MOUSE.PAN,
    RIGHT: THREE.MOUSE.ROTATE,
  };
  controls.update();
}

