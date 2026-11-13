export type DriveCameraMode = "follow" | "fixed";
export type CameraTrack = { x: number; z: number; angle: number };
export const CAMERA_RADIUS = Math.hypot(1.6, 2.4);
const BASE_ANGLE = Math.atan2(1.6, 2.4);
const wrap = (v: number) => Math.atan2(Math.sin(v), Math.cos(v));
export function stepDriveCamera(
  previous: CameraTrack | null,
  pose: { x: number; z: number; heading: number },
  height: number,
  mode: DriveCameraMode,
  delta: number,
  reducedMotion = false,
) {
  const h = Number.isFinite(height) ? Math.max(0.6, height) : 1.3;
  const x = Number.isFinite(pose.x) ? pose.x : 0,
    z = Number.isFinite(pose.z) ? pose.z : 0;
  const heading = Number.isFinite(pose.heading) ? pose.heading : 0;
  const desiredAngle =
    mode === "follow" && !reducedMotion ? BASE_ANGLE - heading : BASE_ANGLE;
  const alpha =
    !previous || reducedMotion
      ? 1
      : 1 -
        Math.exp(
          -Math.min(0.1, Math.max(0, Number.isFinite(delta) ? delta : 0)) * 6,
        );
  const state = {
    x: previous ? previous.x + (x - previous.x) * alpha : x,
    z: previous ? previous.z + (z - previous.z) * alpha : z,
    angle: previous
      ? wrap(previous.angle + wrap(desiredAngle - previous.angle) * alpha)
      : wrap(desiredAngle),
  };
  // Interpolate around the body, not along a chord through it when changing 180-degree views.
  let eyeX = state.x + Math.sin(state.angle) * CAMERA_RADIUS,
    eyeZ = state.z + Math.cos(state.angle) * CAMERA_RADIUS;
  const dx = eyeX - x,
    dz = eyeZ - z,
    distance = Math.hypot(dx, dz),
    minimum = 2;
  if (distance < minimum) {
    const angle = distance > 1e-8 ? Math.atan2(dx, dz) : state.angle;
    eyeX = x + Math.sin(angle) * minimum;
    eyeZ = z + Math.cos(angle) * minimum;
  }
  // Derive look direction from the same smoothed orbit, including transitions to field view.
  const lookHeading = BASE_ANGLE - state.angle;
  return {
    state,
    eye: [eyeX, h + 0.6, eyeZ] as [number, number, number],
    target: [
      state.x + Math.sin(lookHeading) * 0.7,
      h * 0.6,
      state.z - Math.cos(lookHeading) * 0.7,
    ] as [number, number, number],
    desiredAngle: wrap(desiredAngle),
    minimumBodyDistance: minimum,
  };
}
