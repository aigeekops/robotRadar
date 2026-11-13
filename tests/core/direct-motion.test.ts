import { svhHandDefinition } from "../../src/core/svhHandData";
import { handFollowerPose, handDriveLimits } from "../../src/core/handLab";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  boundedPose,
  directPresets,
  sampleDirectMotion,
} from "../../src/core/directMotion.ts";
import type { JointInfo } from "../../src/types.ts";
function jointsFor(id: string): JointInfo[] {
  const xml = readFileSync(`public/robots/${id}/robot.urdf`, "utf8");
  const attr = (s: string, key: string) =>
    new RegExp(`${key}\\s*=\\s*"([^"]+)"`).exec(s)?.[1];
  return [...xml.matchAll(/<joint\b([^>]+)>([\s\S]*?)<\/joint>/g)].flatMap(
    ([, head, body]) => {
      if (
        !attr(head, "type") ||
        attr(head, "type") === "fixed" ||
        /<mimic\b/.test(body)
      )
        return [];
      const limit = /<limit\b([^>]+)\/?\s*>/.exec(body)?.[1] || "";
      return [
        {
          name: attr(head, "name")!,
          type: attr(head, "type")!,
          lower:
            attr(head, "type") === "continuous"
              ? -Math.PI * 2
              : Number(attr(limit, "lower")),
          upper:
            attr(head, "type") === "continuous"
              ? Math.PI * 2
              : Number(attr(limit, "upper")),
          value: 0,
        },
      ];
    },
  );
}
for (const id of [
  "g1",
  "go2",
  "panda",
  "ur5e",
  "fr3",
  "so101",
  "h1",
  "turtlebot3",
  "go2w",
  "spot",
  "open-duck-mini",
  "leap_hand",
])
  test(`${id}: direct actions target exact source joints and stay inside limits throughout interpolation`, () => {
    const joints = jointsFor(id);
    assert.ok(joints.length);
    const presets = directPresets(id, joints);
    assert.ok(presets.length >= 2);
    for (const p of presets)
      for (let step = 0; step <= 100; step++) {
        const pose = sampleDirectMotion(p, step / 100);
        assert.equal(Object.keys(pose).length, joints.length);
        for (const j of joints)
          assert.ok(
            Number.isFinite(pose[j.name]) &&
              pose[j.name] >= j.lower - 1e-10 &&
              pose[j.name] <= j.upper + 1e-10,
            `${p.id}:${j.name}`,
          );
      }
  });
test("missing source joints disable incompatible presets instead of inventing joints", () =>
  assert.deepEqual(directPresets("g1", []), []));
test("nonfinite input is neutralized and invalid limits omitted", () =>
  assert.deepEqual(
    boundedPose(
      [
        { name: "ok", type: "revolute", lower: -1, upper: 1, value: 0 },
        { name: "bad", type: "revolute", lower: 2, upper: 1, value: 0 },
      ],
      { ok: NaN, unknown: 12 },
    ),
    { ok: 0 },
  ));
test("playback boundary clamps and ends at safe rest pose", () => {
  const joints = jointsFor("fr3"),
    p = directPresets("fr3", joints)[0];
  assert.deepEqual(sampleDirectMotion(p, -1), boundedPose(joints));
  assert.deepEqual(sampleDirectMotion(p, 2), boundedPose(joints));
  assert.deepEqual(sampleDirectMotion(p, NaN), boundedPose(joints));
});

test("G1 has seven distinct source-chain teaching sequences including real waist yaw", () => {
  const ps = directPresets("g1", jointsFor("g1"));
  assert.equal(ps.length, 7);
  assert.equal(new Set(ps.map((p) => p.id)).size, 7);
  const turn = ps.find((p) => p.id === "look-and-present")!;
  assert.ok(turn.frames.some((f) => Math.abs(f.waist_yaw_joint) > 0.2));
  for (const p of ps) assert.deepEqual(p.frames[0], p.frames.at(-1));
});

test("standalone Franka Hand moves only its source master through nominal travel", () => {
  const joints = jointsFor("franka-hand");
  assert.equal(joints.length, 1);
  const [preset] = directPresets("franka-hand", joints);
  assert.equal(preset.id, "parallel-travel");
  for (let i = 0; i <= 100; i++) {
    const pose = sampleDirectMotion(preset, i / 100);
    assert.deepEqual(Object.keys(pose), ["fr3_finger_joint1"]);
    assert.ok(pose.fr3_finger_joint1 >= 0 && pose.fr3_finger_joint1 <= 0.04);
  }
  assert.equal(preset.frames[0].fr3_finger_joint1, 0);
  assert.equal(preset.frames.at(-1)!.fr3_finger_joint1, 0);
});

test("SVH direct teaching uses the specialized effective coupled limits for all followers", () => {
  const joints = jointsFor("svh_hand");
  const presets = directPresets("svh_hand", joints);
  assert.equal(presets.length, 3);
  for (const preset of presets)
    for (let i = 0; i <= 120; i++) {
      const pose = sampleDirectMotion(preset, i / 120);
      assert.equal(Object.keys(pose).length, 9);
      for (const j of svhHandDefinition.joints.filter((j) => !j.mimic)) {
        const limit = handDriveLimits(svhHandDefinition, j.name);
        assert.ok(
          pose[j.name] >= limit.lower - 1e-9 &&
            pose[j.name] <= limit.upper + 1e-9,
        );
      }
      const all = handFollowerPose(svhHandDefinition, pose);
      for (const j of svhHandDefinition.joints)
        assert.ok(
          Number.isFinite(all[j.name]) &&
            all[j.name] >= j.lower - 1e-9 &&
            all[j.name] <= j.upper + 1e-9,
          j.name,
        );
    }
  assert.deepEqual(directPresets("svh_hand", joints.slice(1)), []);
  assert.deepEqual(
    directPresets(
      "svh_hand",
      joints.map((j, i) => (i === 0 ? { ...j, upper: j.upper + 0.1 } : j)),
    ),
    [],
  );
});
