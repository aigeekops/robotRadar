import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { leapHandDefinition as definition } from "../../src/core/handLabData";
import {
  boundedHandPose,
  handPreset,
  sampleHandPose,
  validateHandModel,
} from "../../src/core/handLab";
const base = "assets-source/staged/leap_hand/";
const path = existsSync("public/robots/leap_hand/robot.urdf")
  ? "public/robots/leap_hand/robot.urdf"
  : base + "model/robot.urdf";
const xml = readFileSync(path, "utf8");
const attrs = (text: string) =>
  Object.fromEntries(
    [...text.matchAll(/([\w]+)\s*=\s*"([^"]*)"/g)].map((m) => [m[1], m[2]]),
  );
const joints = [...xml.matchAll(/<joint\s([^>]+)>([\s\S]*?)<\/joint>/g)].map(
  (m) => {
    const a = attrs(m[1]),
      limit = attrs(m[2].match(/<limit\s([^>]+)/)![1]);
    return {
      name: a.name,
      type: a.type,
      parent: attrs(m[2].match(/<parent\s([^>]+)/)![1]).link,
      child: attrs(m[2].match(/<child\s([^>]+)/)![1]).link,
      lower: Number(limit.lower),
      upper: Number(limit.upper),
      mimic: m[2].includes("<mimic"),
    };
  },
);
const info = {
  parts: [...xml.matchAll(/<link\s+name="([^"]+)"/g)].map((m) => m[1]),
  joints: definition.joints
    .filter((j) => !j.mimic)
    .map((j) => ({ ...j, value: 0 })),
};

test("LEAP hand definition matches every pinned URDF limit and parent-child chain", () => {
  assert.equal(definition.fingers.length, 4);
  assert.equal(info.parts.length, 17);
  assert.equal(joints.length, 16);
  for (const j of definition.joints) {
    const actual = joints.find((a) => a.name === j.name)!;
    assert.ok(actual);
    for (const key of [
      "type",
      "parent",
      "child",
      "lower",
      "upper",
      "mimic",
    ] as const)
      assert.equal(actual[key], j[key]);
  }
  const seen = new Set<string>();
  for (const finger of definition.fingers) {
    let parent = "palm_lower";
    assert.equal(finger.joints.length, 4);
    for (let i = 0; i < finger.joints.length; i++) {
      const joint = definition.joints.find((j) => j.name === finger.joints[i])!;
      assert.equal(joint.parent, parent);
      assert.equal(joint.child, finger.links[i]);
      assert.equal(seen.has(joint.name), false);
      seen.add(joint.name);
      parent = joint.child;
    }
  }
  assert.equal(seen.size, 16);
  assert.deepEqual(validateHandModel(definition, info), []);
});
test("hand controls fail closed on missing links or altered source limits", () => {
  assert.ok(validateHandModel(definition, { ...info, parts: [] }).length > 0);
  assert.ok(
    validateHandModel(definition, {
      ...info,
      joints: info.joints.map((j) => ({ ...j, upper: j.upper + 0.1 })),
    }).length > 0,
  );
});
test("every illustrative preset and interpolated pose remains source bounded", () => {
  for (const preset of ["open", "fist", "pinch"] as const) {
    const target = handPreset(definition, preset);
    assert.equal(Object.keys(target).length, 16);
    for (const p of [-1, 0, 0.2, 0.5, 1, 2, NaN]) {
      const pose = sampleHandPose(definition, {}, target, p);
      for (const joint of definition.joints) {
        assert.ok(Number.isFinite(pose[joint.name]));
        assert.ok(
          pose[joint.name] >= joint.lower && pose[joint.name] <= joint.upper,
        );
      }
    }
  }
  const malicious = boundedHandPose(definition, {
    "0": Infinity,
    "1": 1e6,
    unknown: 100,
  });
  assert.equal(malicious["0"], 0);
  assert.equal(
    malicious["1"],
    definition.joints.find((j) => j.name === "1")!.upper,
  );
  assert.equal("unknown" in malicious, false);
});
test("mimic and fixed joints are never independent hand commands", () => {
  const altered = {
    ...definition,
    joints: definition.joints.map((j, i) => ({
      ...j,
      mimic: i === 0,
      type: i === 1 ? "fixed" : j.type,
    })),
  };
  const values = boundedHandPose(altered, { "0": 0.1, "1": 0.1 });
  assert.equal("0" in values, false);
  assert.equal("1" in values, false);
});
test("staged LEAP simulation files retain per-file MIT source hashes", () => {
  const audit = JSON.parse(readFileSync(base + "audit.json", "utf8"));
  assert.equal(audit.revision, definition.revision);
  assert.equal(audit.files.length, 9);
  for (const file of audit.files) {
    assert.equal(file.license, "MIT");
    assert.equal(file.modified, false);
    const data = readFileSync(base + "model/" + file.file);
    assert.equal(createHash("sha256").update(data).digest("hex"), file.sha256);
    if (file.file.endsWith(".stl"))
      assert.equal(data.length, 84 + 50 * data.readUInt32LE(80));
  }
  assert.match(
    readFileSync(base + "LICENSE.txt", "utf8"),
    /Copyright 2023 Ananye Agarwal/,
  );
});

test("independent finger curl preserves every other finger and source topology", async () => {
  const { setHandFingerCurl, handFingerCurlLevel } =
    await import("../../src/core/handLab");
  const initial = handPreset(definition, "pinch");
  for (const finger of definition.fingers) {
    const pose = setHandFingerCurl(definition, finger.id, 0.73, initial);
    for (const j of definition.joints) {
      if (!finger.joints.includes(j.name))
        assert.equal(pose[j.name], initial[j.name]);
      assert.ok(pose[j.name] >= j.lower && pose[j.name] <= j.upper);
    }
    assert.ok(
      Math.abs(handFingerCurlLevel(definition, finger.id, pose) - 0.73) < 1e-10,
    );
  }
  assert.deepEqual(
    setHandFingerCurl(definition, "unknown", 1, initial),
    initial,
  );
});
test("wave and thumb sequences are continuous, finite, source bounded and return to zero", async () => {
  const { sampleHandSequence } = await import("../../src/core/handLab");
  const initial = handPreset(definition, "fist");
  for (const sequence of ["wave", "opposition"] as const) {
    assert.deepEqual(
      sampleHandSequence(definition, sequence, 0, initial),
      initial,
    );
    let previous = sampleHandSequence(definition, sequence, 0, initial);
    for (let i = 1; i <= 1000; i++) {
      const current = sampleHandSequence(
        definition,
        sequence,
        i / 1000,
        initial,
      );
      for (const j of definition.joints) {
        assert.ok(Number.isFinite(current[j.name]));
        assert.ok(current[j.name] >= j.lower && current[j.name] <= j.upper);
        assert.ok(
          Math.abs(current[j.name] - previous[j.name]) < 0.03,
          `${sequence} ${i} discontinuity ${j.name}`,
        );
      }
      previous = current;
    }
    assert.deepEqual(previous, boundedHandPose(definition));
  }
});
test("wave has independently phased fingers and coordination visits each non-thumb chain", async () => {
  const { sampleHandSequence } = await import("../../src/core/handLab");
  const peakProgress: number[] = [];
  for (const finger of definition.fingers) {
    let peak = -1,
      at = 0;
    for (let i = 0; i <= 100; i++) {
      const p = i / 100,
        value = sampleHandSequence(definition, "wave", p)[finger.joints[0]];
      if (value > peak) {
        peak = value;
        at = p;
      }
    }
    assert.ok(peak > 0.3);
    peakProgress.push(at);
  }
  assert.equal(new Set(peakProgress).size, 4);
  for (const [index, finger] of definition.fingers
    .filter((f) => f.id !== "thumb")
    .entries()) {
    const p = 0.12 + (0.88 * (index + 0.5)) / 3;
    const pose = sampleHandSequence(definition, "opposition", p);
    assert.ok(pose[finger.joints[0]] > 0.4);
    for (const other of definition.fingers.filter(
      (f) => f.id !== "thumb" && f.id !== finger.id,
    ))
      assert.equal(pose[other.joints[0]], 0);
    assert.ok(pose["12"] > 0.4);
  }
});
