import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceDrive,
  initialDriveState,
  startJump,
  type DriveState,
} from "../../src/core/drive";
import {
  driveTaskFor,
  dockingFeedback,
  DOCK_TARGET,
} from "../../src/core/driveTasks";
const idle = { forward: 0, turn: 0, fast: false, paused: false };
test("task family distinguishes wheel mobility, legged routes and stationary manipulators", () => {
  for (const form of ["arm", "hand", "gripper", "unknown"])
    assert.equal(driveTaskFor({ id: "example", form }), "stationary");
  for (const form of ["humanoid", "biped", "quadruped"])
    assert.equal(driveTaskFor({ id: "example", form }), "leg-route");
  assert.equal(
    driveTaskFor({ id: "go2w", form: "quadruped" }),
    "wheel-docking",
  );
  assert.equal(
    driveTaskFor({ id: "turtlebot3", form: "mobile" }),
    "wheel-docking",
  );
  assert.equal(
    driveTaskFor({ id: "x", form: "wheel-legged" }),
    "wheel-docking",
  );
});
test("wheel and stationary tasks cannot start jumps or move stationary bodies", () => {
  const s = initialDriveState();
  assert.equal(startJump(s, "wheel-docking"), s);
  assert.equal(startJump(s, "stationary"), s);
  assert.equal(
    advanceDrive(s, { ...idle, forward: 1, turn: 1 }, 0.05, "stationary"),
    s,
  );
  assert.equal(
    advanceDrive({ ...s, jump: 0.2 }, idle, 0.05, "wheel-docking").jump,
    -1,
  );
});
test("wheel route requires all seven gates plus continuous position, heading and low-speed dwell", () => {
  let s: DriveState = {
    ...initialDriveState(),
    x: DOCK_TARGET.x,
    z: DOCK_TARGET.z,
    heading: DOCK_TARGET.heading,
    gate: 6,
    started: true,
  };
  for (let i = 0; i < 30; i++) s = advanceDrive(s, idle, 0.05, "wheel-docking");
  assert.equal(s.complete, false);
  assert.equal(s.dockingHold, 0);
  s = { ...s, gate: 7 };
  for (let i = 0; i < 23; i++) s = advanceDrive(s, idle, 0.05, "wheel-docking");
  assert.equal(s.complete, false);
  assert.ok(s.dockingHold > 1.1);
  s = advanceDrive(s, idle, 0.05, "wheel-docking");
  assert.equal(s.complete, true);
  assert.equal(s.dockingHold, 1.2);
  const stopped = advanceDrive(
    s,
    { ...idle, forward: 1, turn: 1 },
    0.05,
    "wheel-docking",
  );
  assert.equal(stopped.x, s.x);
  assert.equal(stopped.elapsed, s.elapsed);
});
test("parking rejects wrong heading, location, speed, rotation and airborne state", () => {
  const s = {
    ...initialDriveState(),
    x: DOCK_TARGET.x,
    z: DOCK_TARGET.z,
    heading: DOCK_TARGET.heading,
    gate: 7,
  };
  assert.equal(dockingFeedback(s).eligible, true);
  for (const patch of [
    { x: s.x + 0.5 },
    { heading: s.heading + 0.2 },
    { speed: 0.09 },
    { angularSpeed: 0.09 },
    { jump: 0 },
  ])
    assert.equal(dockingFeedback({ ...s, ...patch }).eligible, false);
  assert.equal(
    dockingFeedback({ ...s, heading: s.heading + 2 * Math.PI }).eligible,
    true,
  );
});
test("pause, lost alignment and reset clear dwell; invalid delta never advances it", () => {
  const s = {
    ...initialDriveState(),
    x: DOCK_TARGET.x,
    z: DOCK_TARGET.z,
    heading: DOCK_TARGET.heading,
    gate: 7,
    dockingHold: 1,
    started: true,
  };
  assert.equal(
    advanceDrive(s, { ...idle, paused: true }, 100, "wheel-docking")
      .dockingHold,
    0,
  );
  assert.equal(
    advanceDrive({ ...s, x: s.x + 1 }, idle, 0.05, "wheel-docking").dockingHold,
    0,
  );
  assert.equal(advanceDrive(s, idle, NaN, "wheel-docking").dockingHold, 1);
  assert.equal(initialDriveState().dockingHold, 0);
});
