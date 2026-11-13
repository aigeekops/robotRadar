export const armEndpoints: Record<string, string> = {
  panda: "panda_hand_tcp",
  fr3: "fr3_hand_tcp",
  ur5e: "tool0",
  so101: "gripper_frame_link",
};
export function reachPose(
  limits: { name: string; lower: number; upper: number }[],
  stage: number,
) {
  return Object.fromEntries(
    limits.map((j, i) => [
      j.name,
      j.lower +
        (j.upper - j.lower) * (0.5 + 0.12 * Math.sin((i + 1) * (stage + 1))),
    ]),
  );
}
export function dwellProgress(error: number, elapsed: number, dt: number) {
  return Number.isFinite(error) && error <= 0.02
    ? Math.min(1, elapsed + Math.max(0, Math.min(dt, 0.1)))
    : 0;
}
