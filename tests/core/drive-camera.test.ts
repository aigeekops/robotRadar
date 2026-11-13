import test from "node:test";
import assert from "node:assert/strict";
import { stepDriveCamera } from "../../src/core/driveCamera";
test("heading follow stays behind the actual URDF +X body axis at all cardinal headings", () => {
  for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const robot = { x: 4, z: -3, heading },
      c = stepDriveCamera(null, robot, 1.3, "follow", 0.016);
    // Independent rendered-body convention: carrier.rotation.y=pi/2-heading, local forward is +X.
    const yaw = Math.PI / 2 - heading,
      forward = [Math.cos(yaw), -Math.sin(yaw)];
    assert.ok(
      (c.eye[0] - robot.x) * forward[0] + (c.eye[2] - robot.z) * forward[1] <
        -2.3,
    );
    assert.ok(
      (c.target[0] - robot.x) * forward[0] +
        (c.target[2] - robot.z) * forward[1] >
        0.65,
    );
  }
});
test("orbit interpolation never crosses the subject and takes the short path across pi", () => {
  let c = stepDriveCamera(
    null,
    { x: 0, z: 0, heading: Math.PI - 0.01 },
    1.3,
    "follow",
    0.016,
  );
  const before = c.eye;
  c = stepDriveCamera(
    c.state,
    { x: 0, z: 0, heading: -Math.PI + 0.01 },
    1.3,
    "follow",
    0.016,
  );
  assert.ok(Math.hypot(c.eye[0] - before[0], c.eye[2] - before[2]) < 0.03);
  for (let i = 0; i < 100; i++) {
    c = stepDriveCamera(
      c.state,
      { x: 0, z: 0, heading: 0 },
      1.3,
      "fixed",
      0.016,
    );
    assert.ok(Math.hypot(c.eye[0], c.eye[2]) > 2.8);
  }
});
test("camera mode never alters drive state and reverse travel does not flip heading framing", () => {
  const pose = { x: 0, z: 0, heading: 0, speed: -1 };
  const original = JSON.stringify(pose);
  const a = stepDriveCamera(null, pose, 1.3, "follow", 0.016);
  const forwardPose = { ...pose, speed: 1 };
  const b = stepDriveCamera(null, forwardPose, 1.3, "follow", 0.016);
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(pose), original);
  const fixed = stepDriveCamera(
    null,
    { ...pose, heading: 2 },
    1.3,
    "fixed",
    0.016,
  );
  assert.ok(fixed.eye[2] > pose.z);
  assert.ok(fixed.target[2] < pose.z);
});
test("reduced motion uses fixed angle without lag and camera clearance survives a displacement", () => {
  const initial = stepDriveCamera(
    null,
    { x: 0, z: 0, heading: 2 },
    1.3,
    "follow",
    0.016,
  );
  const c = stepDriveCamera(
    initial.state,
    { x: 9, z: 8, heading: -2 },
    1.3,
    "follow",
    NaN,
    true,
  );
  assert.ok(Math.abs(c.eye[0] - 10.6) < 1e-9);
  assert.ok(Math.abs(c.eye[2] - 10.4) < 1e-9);
  for (const dt of [-1, NaN, 0, 100]) {
    const r = stepDriveCamera(
      initial.state,
      { x: initial.eye[0], z: initial.eye[2], heading: 0 },
      1.3,
      "follow",
      dt,
    );
    assert.ok(r.eye.every(Number.isFinite));
    assert.ok(
      Math.hypot(r.eye[0] - initial.eye[0], r.eye[2] - initial.eye[2]) >=
        2 - 1e-9,
    );
  }
});
