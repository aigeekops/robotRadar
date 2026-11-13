import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceDrive,
  initialDriveState,
  startJump,
  jumpHeight,
  DRIVE_GATES,
} from "../../src/core/drive";
const idle = { forward: 0, turn: 0, fast: false, paused: false };
test("drive moves through actual course state and accumulates distance/time", () => {
  let s = initialDriveState();
  for (let i = 0; i < 180; i++)
    s = advanceDrive(s, { ...idle, forward: 1 }, 1 / 60);
  assert.ok(s.z < -2);
  assert.ok(s.distance > 2);
  assert.ok(s.elapsed > 1.9);
  assert.equal(s.gate, 1);
});
test("drive turn, reverse, fast and scene boundaries are deterministic", () => {
  let a = initialDriveState(),
    b = initialDriveState();
  for (let i = 0; i < 100; i++) {
    a = advanceDrive(a, { ...idle, forward: 1 }, 0.02);
    b = advanceDrive(b, { ...idle, forward: 1, fast: true }, 0.02);
  }
  assert.ok(b.distance > a.distance);
  assert.ok(advanceDrive(a, { ...idle, turn: 1 }, 0.05).heading > a.heading);
  let reverse = initialDriveState();
  for (let i = 0; i < 10000; i++)
    reverse = advanceDrive(reverse, { ...idle, forward: -1, fast: true }, 0.05);
  assert.equal(reverse.z, 15);
});
test("gates must be reached sequentially and completion freezes controls", () => {
  let s = initialDriveState();
  s = advanceDrive({ ...s, ...DRIVE_GATES[4] }, idle, 0.01);
  assert.equal(s.gate, 0);
  for (const gate of DRIVE_GATES)
    s = advanceDrive({ ...s, ...gate }, idle, 0.01);
  assert.equal(s.gate, 7);
  assert.equal(s.complete, true);
  const next = advanceDrive(s, { ...idle, forward: 1, turn: 1 }, 0.05);
  assert.equal(next.x, s.x);
  assert.equal(next.z, s.z);
  assert.equal(next.elapsed, s.elapsed);
});
test("pause, invalid frame deltas and resume cannot teleport", () => {
  const a = advanceDrive(initialDriveState(), { ...idle, forward: 1 }, 1 / 60);
  const paused = advanceDrive(a, { ...idle, paused: true }, 100);
  assert.equal(paused.z, a.z);
  assert.equal(paused.elapsed, a.elapsed);
  assert.equal(paused.speed, 0);
  const b = advanceDrive(a, { ...idle, forward: 1 }, 1000);
  assert.ok(Math.abs(b.z - a.z) < 0.2);
  assert.ok(Number.isFinite(advanceDrive(a, idle, NaN).z));
});
test("illustrative jump has bounded arc, rejects stacking and returns to floor", () => {
  let a = startJump(initialDriveState());
  assert.equal(startJump(a), a);
  assert.ok(jumpHeight(0.5) <= 0.6);
  for (let i = 0; i < 100; i++) a = advanceDrive(a, idle, 0.02);
  assert.equal(a.jump, -1);
  assert.equal(jumpHeight(a.jump), 0);
  assert.ok(a.bestJump > 0.59);
  assert.deepEqual(initialDriveState(), initialDriveState());
});
