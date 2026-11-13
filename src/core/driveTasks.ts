import type { DriveState } from "./drive";
export type DriveTaskKind = "leg-route" | "wheel-docking" | "stationary";
export function driveTaskFor(robot: {
  id: string;
  form: string;
}): DriveTaskKind {
  if (robot.id === "go2w" || ["mobile", "wheel-legged"].includes(robot.form))
    return "wheel-docking";
  if (["humanoid", "biped", "quadruped"].includes(robot.form))
    return "leg-route";
  return "stationary";
}
/** Teaching-task tolerances in the scene, not robot specifications or contact detection. */
export const DOCK_TARGET = {
  x: 4.6,
  z: -1,
  heading: Math.PI / 2,
  radius: 0.45,
  headingTolerance: Math.PI / 18,
  speedTolerance: 0.08,
  angularSpeedTolerance: 0.08,
  holdSeconds: 1.2,
} as const;
export function dockingFeedback(
  s: Pick<
    DriveState,
    "x" | "z" | "heading" | "speed" | "angularSpeed" | "gate" | "jump"
  >,
) {
  const distance = Math.hypot(s.x - DOCK_TARGET.x, s.z - DOCK_TARGET.z);
  const angle = Math.abs(
    Math.atan2(
      Math.sin(s.heading - DOCK_TARGET.heading),
      Math.cos(s.heading - DOCK_TARGET.heading),
    ),
  );
  const eligible =
    s.gate === 7 &&
    distance <= DOCK_TARGET.radius &&
    angle <= DOCK_TARGET.headingTolerance &&
    Math.abs(s.speed) <= DOCK_TARGET.speedTolerance &&
    Math.abs(s.angularSpeed) <= DOCK_TARGET.angularSpeedTolerance &&
    s.jump < 0;
  return { distance, angle, eligible };
}
