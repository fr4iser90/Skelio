import type { EditorProject, IkPlanarFabrikChain, IkTwoBoneChain } from "../types.js";

/**
 * Read IK chains in a backward-compatible way.
 *
 * Priority:
 * 1) `project.rig.ik.twoBoneChains`
 * 2) legacy `project.ikTwoBoneChains`
 */
export function getTwoBoneIkChains(project: EditorProject): IkTwoBoneChain[] {
  const fromRig = project.rig?.ik?.twoBoneChains;
  if (Array.isArray(fromRig)) return fromRig;
  const legacy = project.ikTwoBoneChains;
  if (Array.isArray(legacy)) return legacy;
  return [];
}

export function setTwoBoneIkChains(project: EditorProject, chains: IkTwoBoneChain[] | undefined): void {
  if (!project.rig) project.rig = {};
  if (!project.rig.ik) project.rig.ik = {};
  if (chains && chains.length > 0) {
    project.rig.ik.twoBoneChains = chains;
  } else {
    delete project.rig.ik.twoBoneChains;
    if (Object.keys(project.rig.ik).length === 0) delete project.rig.ik;
    if (Object.keys(project.rig).length === 0) delete project.rig;
  }
}

export function getFabrikIkChains(project: EditorProject): IkPlanarFabrikChain[] {
  const list = project.rig?.ik?.fabrikChains;
  return Array.isArray(list) ? list : [];
}

export function getFabrikIkChainById(project: EditorProject, chainId: string): IkPlanarFabrikChain | null {
  return getFabrikIkChains(project).find((c) => c.id === chainId) ?? null;
}

