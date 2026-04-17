import * as THREE from "three";

/**
 * WebGL seam/gap mitigation for textured skinned slices:
 * when alpha is low, sample neighboring texels (UV dilation) to pull opaque edge colors inward.
 *
 * This replaces the old Canvas-only seam/gap fill passes.
 */
export function createSpriteSeamFillBasicMaterial(opts: {
  map: THREE.Texture;
  /** UV step in texels (typically 1 / textureSize). */
  dilationUv: number;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
  depthTest?: boolean;
  depthWrite?: boolean;
}): THREE.MeshBasicMaterial {
  const mat = new THREE.MeshBasicMaterial({
    map: opts.map,
    transparent: opts.transparent ?? true,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.DoubleSide,
    depthTest: opts.depthTest ?? true,
    depthWrite: opts.depthWrite ?? false,
  });

  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `
#include <map_fragment>
{
  // Dilate opaque edges into transparent interior (reduces cracks after deformation).
  float d = dilationUv;
  vec2 duv = vec2(d, d);
  vec4 s0 = texture2D(map, vMapUv);
  vec4 s1 = texture2D(map, vMapUv + vec2(duv.x, 0.0));
  vec4 s2 = texture2D(map, vMapUv - vec2(duv.x, 0.0));
  vec4 s3 = texture2D(map, vMapUv + vec2(0.0, duv.y));
  vec4 s4 = texture2D(map, vMapUv - vec2(0.0, duv.y));
  vec4 sm = max(max(max(max(s0, s1), s2), max(s3, s4));
  float a0 = diffuseColor.a * s0.a;
  float am = sm.a;
  // If current sample is mostly transparent but neighbors have color, borrow neighbor alpha/color.
  if (a0 < 0.02 && am > 0.02) {
    diffuseColor.rgb = sm.rgb;
    diffuseColor.a = max(diffuseColor.a, am);
  }
}
`,
    );
  };

  // Store dilation as a uniform-like constant via defines is awkward; use a tiny uniform instead.
  mat.userData = { ...(mat.userData ?? {}), dilationUv: opts.dilationUv };
  mat.defines = { ...(mat.defines ?? {}), USE_UV: "1" };

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.dilationUv = { value: opts.dilationUv };
    shader.fragmentShader = `
uniform float dilationUv;
` + shader.fragmentShader.replace(
      "#include <map_fragment>",
      `
#include <map_fragment>
{
  float d = dilationUv;
  vec2 duv = vec2(d, d);
  vec4 s0 = texture2D(map, vMapUv);
  vec4 s1 = texture2D(map, vMapUv + vec2(duv.x, 0.0));
  vec4 s2 = texture2D(map, vMapUv - vec2(duv.x, 0.0));
  vec4 s3 = texture2D(map, vMapUv + vec2(0.0, duv.y));
  vec4 s4 = texture2D(map, vMapUv - vec2(0.0, duv.y));
  vec4 sm = max(max(max(max(s0, s1), s2), max(s3, s4));
  float a0 = diffuseColor.a * s0.a;
  float am = sm.a;
  if (a0 < 0.02 && am > 0.02) {
    diffuseColor.rgb = sm.rgb;
    diffuseColor.a = max(diffuseColor.a, am);
  }
}
`,
    );
  };

  return mat;
}
