import type { ModelInfo } from "../types";
export const GRIPPER_MASTER = "fr3_finger_joint1";
export const GRIPPER_FOLLOWER = "fr3_finger_joint2";
export function gripperRange(info: ModelInfo) {
  const a = info.joints.find((j) => j.name === GRIPPER_MASTER),
    b = info.joints.find((j) => j.name === GRIPPER_FOLLOWER);
  if (!a || a.type !== "prismatic" || (b && b.type !== "prismatic"))
    return null;
  // Viewer reports only independent joints. The audited follower is verified by
  // its loaded link, then driven exclusively by the retained URDF mimic relation.
  if (
    !b &&
    !["fr3_hand", "fr3_leftfinger", "fr3_rightfinger"].every((n) =>
      info.parts.includes(n),
    )
  )
    return null;
  const lower = Math.max(a.lower, b?.lower ?? a.lower),
    upper = Math.min(a.upper, b?.upper ?? a.upper);
  return Number.isFinite(lower) && Number.isFinite(upper) && upper > lower
    ? { lower, upper }
    : null;
}
export function gripperCommand(info: ModelInfo, opening: number) {
  const r = gripperRange(info);
  if (!r || !Number.isFinite(opening)) return null;
  // Only command the master; URDF's multiplier=1, offset=0 mimic drives the follower.
  return {
    [GRIPPER_MASTER]: Math.max(r.lower, Math.min(r.upper, opening / 2)),
  };
}
export function nominalOpening(
  info: ModelInfo,
  values: Record<string, number>,
) {
  const r = gripperRange(info);
  if (!r) return null;
  const q = values[GRIPPER_MASTER];
  return (
    2 * Math.max(r.lower, Math.min(r.upper, Number.isFinite(q) ? q : r.lower))
  );
}
