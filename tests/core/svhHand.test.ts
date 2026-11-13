import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { svhHandDefinition as definition } from "../../src/core/svhHandData";
import { handDefinitionForRobot } from "../../src/core/handRegistry";
import {
  boundedHandPose,
  handDriveLimits,
  handFollowerPose,
  handPreset,
  sampleHandSequence,
  setHandFingerCurl,
  validateHandModel,
  type HandDefinition,
} from "../../src/core/handLab";
const xml = readFileSync(
  "assets-source/staged/hand-research/svh-left.urdf",
  "utf8",
);
const attrs = (text: string) =>
  Object.fromEntries(
    [...text.matchAll(/([\w]+)\s*=\s*"([^"]*)"/g)].map((m) => [m[1], m[2]]),
  );
const source = [...xml.matchAll(/<joint\s([^>]+)>([\s\S]*?)<\/joint>/g)]
  .map((m) => {
    const a = attrs(m[1]);
    return { name: a.name, type: a.type, body: m[2] };
  })
  .filter((j) => j.type === "revolute");
const parts = [...xml.matchAll(/<link\s+name="([^"]+)"/g)].map((m) => m[1]);
const drives = definition.joints.filter((j) => !j.mimic);
const info = { parts, joints: drives.map((j) => ({ ...j, value: 0 })) };
test("SVH five digits map all nine independent source drives and eleven exact mimic relations", () => {
  assert.equal(parts.length, 32);
  assert.equal(source.length, 20);
  assert.equal(definition.fingers.length, 5);
  assert.equal(drives.length, 9);
  assert.equal(definition.joints.filter((j) => j.mimic).length, 11);
  const grouped = [
    ...definition.fingers.flatMap((f) => f.joints),
    ...(definition.sharedJoints || []),
  ];
  assert.equal(new Set(grouped).size, 9);
  assert.deepEqual(grouped.sort(), drives.map((j) => j.name).sort());
  for (const joint of definition.joints) {
    const s = source.find((j) => j.name === joint.name)!;
    assert.ok(s);
    const lim = attrs(s.body.match(/<limit\s([^>]+)/)![1]);
    assert.equal(joint.lower, Number(lim.lower));
    assert.equal(joint.upper, Number(lim.upper));
    assert.equal(
      joint.parent,
      attrs(s.body.match(/<parent\s([^>]+)/)![1]).link,
    );
    assert.equal(joint.child, attrs(s.body.match(/<child\s([^>]+)/)![1]).link);
    const mimic = s.body.match(/<mimic\s([^>]+)/);
    assert.equal(joint.mimic, !!mimic);
    if (mimic) {
      const m = attrs(mimic[1]);
      assert.deepEqual(joint.mimicSource, {
        joint: m.joint,
        multiplier: Number(m.multiplier),
        offset: Number(m.offset),
      });
    }
  }
  for (const finger of definition.fingers)
    for (const link of finger.links) assert.ok(parts.includes(link));
  assert.deepEqual(validateHandModel(definition, info), []);
  assert.equal(handDefinitionForRobot("svh_hand"), definition);
  assert.equal(handDefinitionForRobot("unknown"), undefined);
});
test("SVH derived driver limits protect every mimic follower without rewriting source bounds", () => {
  const middle = definition.joints.find(
    (j) => j.name === "left_hand_Middle_Finger_Distal",
  )!;
  assert.equal(middle.upper, 1.334);
  assert.ok(handDriveLimits(definition, middle.name).upper < middle.upper);
  for (const amount of [-1e6, 0, 0.3, 1e6]) {
    const commands = boundedHandPose(
      definition,
      Object.fromEntries(drives.map((j) => [j.name, amount])),
    );
    assert.equal(Object.keys(commands).length, 9);
    const all = handFollowerPose(definition, commands);
    for (const joint of definition.joints) {
      assert.ok(Number.isFinite(all[joint.name]));
      assert.ok(all[joint.name] >= joint.lower - 1e-10);
      assert.ok(all[joint.name] <= joint.upper + 1e-10);
    }
  }
});
test("SVH presets and wave/opposition sequences stay source bounded including all followers", () => {
  const poses = ["open", "fist", "pinch"].map((p) =>
    handPreset(definition, p as "open" | "fist" | "pinch"),
  );
  for (const sequence of ["wave", "opposition"] as const)
    for (let i = 0; i <= 300; i++)
      poses.push(sampleHandSequence(definition, sequence, i / 300));
  for (const pose of poses) {
    assert.equal(Object.keys(pose).length, 9);
    const all = handFollowerPose(definition, pose);
    for (const joint of definition.joints) {
      assert.ok(Number.isFinite(all[joint.name]));
      assert.ok(all[joint.name] >= joint.lower - 1e-10);
      assert.ok(all[joint.name] <= joint.upper + 1e-10);
    }
  }
});
test("SVH finger coordination preserves other independent drivers including shared spread", () => {
  const initial = boundedHandPose(
    definition,
    Object.fromEntries(drives.map((j) => [j.name, 0.2])),
  );
  for (const finger of definition.fingers) {
    const pose = setHandFingerCurl(definition, finger.id, 0.8, initial);
    for (const joint of drives)
      if (!finger.joints.includes(joint.name))
        assert.equal(pose[joint.name], initial[joint.name]);
  }
});
test("affine negative mimic offsets constrain drives and cyclic invalid definitions fail closed", () => {
  const d: HandDefinition = {
    ...definition,
    joints: [
      {
        name: "a",
        parent: "p",
        child: "q",
        type: "revolute",
        lower: -2,
        upper: 2,
        mimic: false,
      },
      {
        name: "b",
        parent: "q",
        child: "r",
        type: "revolute",
        lower: -0.5,
        upper: 1,
        mimic: true,
        mimicSource: { joint: "a", multiplier: -2, offset: 0.2 },
      },
    ],
  };
  const limits = handDriveLimits(d, "a");
  assert.equal(limits.lower, -0.4);
  assert.equal(limits.upper, 0.35);
  assert.equal(boundedHandPose(d, { a: 10 }).a, 0.35);
  d.joints[1].mimicSource!.joint = "b";
  assert.deepEqual(boundedHandPose(d, { a: 1 }), {});
});
