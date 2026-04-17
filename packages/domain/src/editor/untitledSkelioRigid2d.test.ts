/**
 * Fixture: repo-root `Untitled.skelio.json` (user rig). Verifies 2D rigid slice math:
 * rotation-only bind + pose (same basis as skinning) vs mixing raw projected Mat2D.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { EditorProject } from "./types.js";
import { validateEditorProject } from "./validate.js";
import { evaluatePose } from "./rig/evaluatePose.js";
import { worldBindBoneMatrices2D } from "./bone3dPose.js";
import { boundSliceLocalInBindSpace, boundSliceWorldAtPose } from "./pose.js";
import { apply, rotationOnly2d } from "./mat2d.js";

const FIXTURE = fileURLToPath(new URL("../../../../Untitled.skelio.json", import.meta.url));

/** Same planar opts as desktop 2D viewport (`planarBindOpts`). */
const PO_2D = { planar2dNoTiltSpin: true as const };

function loadFixture(): EditorProject {
  return JSON.parse(readFileSync(FIXTURE, "utf8")) as EditorProject;
}

/** Repo-root `Untitled.skelio.json` (user rig). Skip if absent (e.g. CI clone without file). */
describe.skipIf(!existsSync(FIXTURE))("Untitled.skelio.json — 2D rigid hand slice vs raw Mat2D mix", () => {
  it("loads and validates", () => {
    const p = loadFixture();
    const issues = validateEditorProject(p);
    expect(issues, JSON.stringify(issues)).toEqual([]);
  });

  it("r hand slice: rotation-only bind+pose differs from raw P2raw×B2raw mix (when shear/scale in 2×2)", () => {
    const p = loadFixture();
    const pose = evaluatePose(p, 0, { applyIk: false, planar2dNoTiltSpin: true });

    const handBoneId = "bone_lurrgwjirl";
    const worldCx = -182.5346703016887;
    const worldCy = 13.910625396015803;

    const Braw = worldBindBoneMatrices2D(p, PO_2D).get(handBoneId);
    const Praw = pose.solvedWorld2dByBoneId.get(handBoneId);
    expect(Braw).toBeDefined();
    expect(Praw).toBeDefined();

    const B = rotationOnly2d(Braw!);
    const P = rotationOnly2d(Praw!);

    const locRot = boundSliceLocalInBindSpace(B, worldCx, worldCy);
    expect(locRot).not.toBeNull();
    const wpRot = boundSliceWorldAtPose(P, locRot!.lx, locRot!.ly);

    const locRaw = boundSliceLocalInBindSpace(Braw!, worldCx, worldCy);
    expect(locRaw).not.toBeNull();
    const wpRaw = boundSliceWorldAtPose(Praw!, locRaw!.lx, locRaw!.ly);

    const delta = Math.hypot(wpRot.x - wpRaw.x, wpRot.y - wpRaw.y);
    // Fixture has non-trivial 2D projection; corrected path should move the slice by a measurable amount.
    expect(delta).toBeGreaterThan(0.5);
  });

  it("r forearm → r hand: raw projected tip vs hand joint (planar tip-snap closes FK)", () => {
    const p = loadFixture();
    const pose = evaluatePose(p, 0, { applyIk: false, planar2dNoTiltSpin: true });

    const forearmId = "bone_vylp7nsthz";
    const handId = "bone_lurrgwjirl";
    const forearm = p.bones.find((b) => b.id === forearmId)!;
    const W = pose.solvedWorld2dByBoneId;
    // Use full projected Mat2D here — `rotationOnly2d` changes how (length,0) maps when the 2×2 has shear/scale, which would fake a tip↔joint gap.
    const Mf = W.get(forearmId)!;
    const Mh = W.get(handId)!;
    const tip = apply(Mf, forearm.length, 0);
    const joint = apply(Mh, 0, 0);
    const gap = Math.hypot(tip.x - joint.x, tip.y - joint.y);

    expect(gap).toBeLessThan(0.5);
  });

  it("r hand slice world (rotation-only path) snapshot", () => {
    const p = loadFixture();
    const pose = evaluatePose(p, 0, { applyIk: false, planar2dNoTiltSpin: true });
    const handBoneId = "bone_lurrgwjirl";
    const worldCx = -182.5346703016887;
    const worldCy = 13.910625396015803;

    const B = rotationOnly2d(worldBindBoneMatrices2D(p, PO_2D).get(handBoneId)!);
    const P = rotationOnly2d(pose.solvedWorld2dByBoneId.get(handBoneId)!);
    const loc = boundSliceLocalInBindSpace(B, worldCx, worldCy)!;
    const wp = boundSliceWorldAtPose(P, loc.lx, loc.ly);

    expect({ cx: wp.x, cy: wp.y, rot: wp.rotationRad }).toMatchSnapshot();
  });
});
