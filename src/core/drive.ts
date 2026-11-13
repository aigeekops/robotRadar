import { dockingFeedback, DOCK_TARGET, type DriveTaskKind } from "./driveTasks";
/** Educational kinematic course. None of these constants describe real robot performance. */
export const DRIVE_GATES = [
  { x: 0, z: -3 },
  { x: 0, z: -6 },
  { x: -3, z: -8 },
  { x: -6, z: -8 },
  { x: -6, z: -4 },
  { x: -3, z: -1 },
  { x: 3, z: -1 },
] as const;
export type DriveState = {
  x: number;
  z: number;
  heading: number;
  speed: number;
  acceleration: number;
  angularSpeed: number;
  travel: number;
  distance: number;
  elapsed: number;
  gate: number;
  started: boolean;
  jump: number;
  bestJump: number;
  complete: boolean;
  dockingHold: number;
};
export type DriveInput = {
  forward: number;
  turn: number;
  fast: boolean;
  paused: boolean;
};
export const initialDriveState = (): DriveState => ({
  x: 0,
  z: 0,
  heading: 0,
  speed: 0,
  acceleration: 0,
  angularSpeed: 0,
  travel: 0,
  distance: 0,
  elapsed: 0,
  gate: 0,
  started: false,
  jump: -1,
  bestJump: 0,
  complete: false,
  dockingHold: 0,
});
export function jumpHeight(progress: number): number {
  return progress >= 0 && progress <= 1
    ? Math.sin(progress * Math.PI) * 0.6
    : 0;
}
export function startJump(
  state: DriveState,
  task: DriveTaskKind = "leg-route",
): DriveState {
  if (task !== "leg-route") return state;
  return state.jump < 0 && !state.complete
    ? { ...state, jump: 0, started: true }
    : state;
}
export function advanceDrive(
  state: DriveState,
  input: DriveInput,
  delta: number,
  task: DriveTaskKind = "leg-route",
): DriveState {
  if (task === "stationary") return state;
  if (input.paused || state.complete)
    return {
      ...state,
      speed: 0,
      acceleration: 0,
      angularSpeed: 0,
      dockingHold: state.complete ? state.dockingHold : 0,
    };
  const dt = Math.min(0.05, Math.max(0, Number.isFinite(delta) ? delta : 0));
  const forward = Math.max(
    -1,
    Math.min(1, Number.isFinite(input.forward) ? input.forward : 0),
  );
  const turn = Math.max(
    -1,
    Math.min(1, Number.isFinite(input.turn) ? input.turn : 0),
  );
  const angularSpeed =
    state.angularSpeed +
    (turn * 1.65 - state.angularSpeed) * (1 - Math.exp(-12 * dt));
  const heading = state.heading + angularSpeed * dt;
  const target = forward * (input.fast ? 2.8 : 1.4);
  const desiredAcceleration = Math.max(
    -3,
    Math.min(3, (target - state.speed) * 8),
  );
  let acceleration =
    state.acceleration +
    Math.max(
      -18 * dt,
      Math.min(18 * dt, desiredAcceleration - state.acceleration),
    );
  let speed = state.speed + acceleration * dt;
  if ((target - state.speed) * (target - speed) <= 0) {
    speed = target;
    acceleration = 0;
  }
  if (Math.abs(speed) < 0.0001 && target === 0) {
    speed = 0;
    acceleration = 0;
  }
  const x = Math.max(
    -15,
    Math.min(15, state.x + Math.sin(heading) * speed * dt),
  );
  const z = Math.max(
    -15,
    Math.min(15, state.z - Math.cos(heading) * speed * dt),
  );
  const moved = Math.hypot(x - state.x, z - state.z);
  const started =
    state.started ||
    Math.abs(forward) > 0 ||
    Math.abs(turn) > 0 ||
    state.jump >= 0;
  let gate = state.gate;
  if (gate < DRIVE_GATES.length) {
    const goal = DRIVE_GATES[gate];
    const previous = gate ? DRIVE_GATES[gate - 1] : { x: 0, z: 0 };
    const length = Math.hypot(goal.x - previous.x, goal.z - previous.z);
    const nx = (goal.x - previous.x) / length,
      nz = (goal.z - previous.z) / length;
    const before = (state.x - goal.x) * nx + (state.z - goal.z) * nz;
    const after = (x - goal.x) * nx + (z - goal.z) * nz;
    const lateral = Math.abs((x - goal.x) * nz - (z - goal.z) * nx);
    if (before <= 0 && after >= 0 && lateral < 0.9) gate++;
  }
  const jump =
    task === "leg-route" && state.jump >= 0
      ? state.jump + dt / 0.85 > 1
        ? -1
        : state.jump + dt / 0.85
      : -1;
  const actualSpeed = dt > 0 ? (Math.sign(speed) * moved) / dt : 0;
  const dockingHold =
    task === "wheel-docking" &&
    dockingFeedback({
      x,
      z,
      heading,
      speed: actualSpeed,
      angularSpeed,
      gate,
      jump,
    }).eligible
      ? Math.min(DOCK_TARGET.holdSeconds, (state.dockingHold || 0) + dt)
      : 0;
  return {
    ...state,
    x,
    z,
    heading,
    speed: actualSpeed,
    acceleration,
    angularSpeed,
    travel: state.travel + Math.sign(speed) * moved,
    distance: state.distance + moved,
    elapsed: state.elapsed + (started ? dt : 0),
    gate,
    started,
    jump,
    bestJump: Math.max(state.bestJump, jumpHeight(jump)),
    dockingHold,
    complete:
      task === "wheel-docking"
        ? dockingHold >= DOCK_TARGET.holdSeconds
        : gate === DRIVE_GATES.length,
  };
}
