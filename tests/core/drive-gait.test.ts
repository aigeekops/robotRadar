import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import * as THREE from "three";
import { URDFRobot, URDFJoint, URDFLink } from "urdf-loader/src/URDFClasses.js";
import {
  footTrajectory,
  finiteDampedStep,
  GAIT_STRIDE,
} from "../../src/core/driveGait";
import { createDriveFootIK } from "../../src/viewer/driveFootIK";
import { advanceDrive, initialDriveState } from "../../src/core/drive";

test("stance targets cancel steady root travel and swing clears smoothly in both directions", () => {
  for (const direction of [-1, 1])
    for (const side of ["left", "right"] as const) {
      let previous: {
        p: ReturnType<typeof footTrajectory>;
        travel: number;
      } | null = null;
      for (let i = 0; i < 1000; i++) {
        const travel = direction * i * 0.001,
          p = footTrajectory(travel, side, 1);
        assert.ok(Number.isFinite(p.forward) && p.lift >= 0 && p.lift <= 0.065);
        if (
          previous &&
          p.stance &&
          previous.p.stance &&
          Math.abs(p.phase - previous.p.phase) < 0.05
        )
          assert.ok(
            Math.abs(
              travel + p.forward - (previous.travel + previous.p.forward),
            ) < 1e-9,
          );
        previous = { p, travel };
      }
    }
  for (const side of ["left", "right"] as const) {
    const p = footTrajectory(0, side, 0);
    assert.ok(p.forward === 0);
    assert.equal(p.lift, 0);
  }
});
test("damped IK rejects invalid input and bounds singular or large corrections", () => {
  assert.deepEqual(
    finiteDampedStep(
      [
        [NaN, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      [1, 0, 0],
    ),
    [0, 0, 0],
  );
  assert.deepEqual(
    finiteDampedStep(
      [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ],
      [10, 10, 10],
    ),
    [0, 0, 0],
  );
  assert.ok(
    finiteDampedStep(
      [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      [10, -10, 10],
    ).every((v) => Math.abs(v) <= 0.12),
  );
});
function sourceSkeleton() {
  const source = JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        `import xml.etree.ElementTree as E,json
r=E.parse('public/robots/g1/robot.urdf').getroot()
a=[]
for j in r.findall('joint'):
 o=j.find('origin');ax=j.find('axis');lim=j.find('limit')
 a.append(dict(name=j.get('name'),type=j.get('type'),parent=j.find('parent').get('link'),child=j.find('child').get('link'),xyz=[float(v) for v in o.get('xyz','0 0 0').split()] if o is not None else [0,0,0],rpy=[float(v) for v in o.get('rpy','0 0 0').split()] if o is not None else [0,0,0],axis=[float(v) for v in ax.get('xyz').split()] if ax is not None else [1,0,0],lower=float(lim.get('lower',0)) if lim is not None else 0,upper=float(lim.get('upper',0)) if lim is not None else 0))
print(json.dumps(dict(links=[l.get('name') for l in r.findall('link')],joints=a)))`,
      ],
      { encoding: "utf8" },
    ),
  );
  const robot = new URDFRobot(),
    carrier = new THREE.Group();
  robot.links = {};
  robot.joints = {};
  for (const name of source.links) {
    const l = new URDFLink();
    l.name = name;
    robot.links[name] = l;
  }
  const children = new Set();
  for (const data of source.joints) {
    const j = new URDFJoint();
    j.name = data.name;
    j.jointType = data.type;
    j.position.fromArray(data.xyz);
    j.quaternion.setFromEuler(
      new THREE.Euler(...(data.rpy as [number, number, number]), "ZYX"),
    );
    j.axis.fromArray(data.axis);
    j.limit.lower = data.lower;
    j.limit.upper = data.upper;
    robot.joints[j.name] = j;
    robot.links[data.parent].add(j);
    j.add(robot.links[data.child]);
    children.add(data.child);
  }
  for (const name of source.links)
    if (!children.has(name)) robot.add(robot.links[name]);
  robot.rotation.x = -Math.PI / 2;
  robot.position.y = 0.8;
  carrier.add(robot);
  return { robot, carrier };
}
test("actual G1 source chain tracks gait anchors with bounded error, unchanged lengths and joint limits", () => {
  const { robot, carrier } = sourceSkeleton();
  const origins = Object.fromEntries(
    Object.entries(robot.joints).map(([n, j]) => [n, j.position.toArray()]),
  );
  const ik = createDriveFootIK(robot, carrier)!;
  assert.ok(ik);
  let maxError = 0,
    totalSpeed = 0,
    samples = 0;
  let previous: ReturnType<typeof ik.update> | null = null;
  const start = performance.now();
  carrier.rotation.y = Math.PI / 2;
  for (let i = 0; i < 600; i++) {
    const travel = (i / 60) * 1.4;
    carrier.position.z = -travel;
    const result = ik.update(travel, 1);
    if (i > 20) maxError = Math.max(maxError, result.maxError);
    for (const side of ["left", "right"]) {
      const now = result.feet[side],
        prev = previous?.feet[side];
      if (
        i > 20 &&
        now.stance &&
        prev?.stance &&
        Math.abs(now.target[0] - prev.target[0]) +
          Math.abs(now.target[2] - prev.target[2]) <
          0.001
      ) {
        totalSpeed +=
          new THREE.Vector3(
            ...(now.actual as [number, number, number]),
          ).distanceTo(
            new THREE.Vector3(...(prev.actual as [number, number, number])),
          ) * 60;
        samples++;
      }
    }
    previous = result;
    for (const [name, j] of Object.entries(robot.joints)) {
      assert.deepEqual(j.position.toArray(), origins[name]);
      if (j.jointType === "revolute") {
        assert.ok(Number.isFinite(j.jointValue[0]));
        assert.ok(
          j.jointValue[0] >= j.limit.lower - 1e-9 &&
            j.jointValue[0] <= j.limit.upper + 1e-9,
        );
      }
    }
  }
  const elapsed = performance.now() - start;
  assert.ok(maxError < 0.008, `max error ${maxError}`);
  assert.ok(
    totalSpeed / samples < 0.06,
    `stance anchor speed ${totalSpeed / samples}`,
  );
  assert.ok(elapsed < 5000, `600 frame solve took ${elapsed} ms`);
});
test("drive acceleration and yaw ramp gradually and release to rest without reversal", () => {
  let s = initialDriveState();
  s = advanceDrive(
    s,
    { forward: 1, turn: 1, fast: false, paused: false },
    1 / 60,
  );
  assert.ok(s.speed < 0.02);
  assert.ok(s.angularSpeed > 0 && s.angularSpeed < 1.65);
  for (let i = 0; i < 180; i++)
    s = advanceDrive(
      s,
      { forward: 1, turn: 0, fast: false, paused: false },
      1 / 60,
    );
  assert.ok(s.speed > 1.3);
  for (let i = 0; i < 180; i++) {
    s = advanceDrive(
      s,
      { forward: 0, turn: 0, fast: false, paused: false },
      1 / 60,
    );
    assert.ok(s.speed >= 0);
  }
  assert.equal(s.speed, 0);
  assert.ok(Math.abs(s.angularSpeed) < 0.0001);
  assert.ok(s.travel > 0);
});
