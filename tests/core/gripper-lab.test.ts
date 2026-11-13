import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  gripperRange,
  gripperCommand,
  nominalOpening,
} from "../../src/core/gripperLab";
const root = new URL("../../public/robots/franka-hand/", import.meta.url);
const p = JSON.parse(readFileSync(new URL("provenance.json", root), "utf8"));
const info = {
  parts: [],
  joints: p.joints
    .filter((j: any) => j.type !== "fixed")
    .map((j: any) => ({
      name: j.id,
      type: j.type,
      lower: Number(j.limit.lower),
      upper: Number(j.limit.upper),
      value: 0,
    })),
};
test("real source limits give 80mm nominal travel; only master commanded", () => {
  assert.deepEqual(gripperRange(info), { lower: 0, upper: 0.04 });
  assert.deepEqual(gripperCommand(info, 1), { fr3_finger_joint1: 0.04 });
  assert.equal(nominalOpening(info, { fr3_finger_joint1: 0.02 }), 0.04);
  assert.equal(gripperCommand(info, NaN), null);
  assert.equal(gripperRange({ parts: [], joints: [] }), null);
});
test("derived subtree retains source mimic and all mesh bytes", () => {
  const xml = readFileSync(new URL("robot.urdf", root), "utf8");
  assert.ok(xml.includes('<mimic joint="fr3_finger_joint1"'));
  assert.ok(!xml.includes("fr3_link0"));
  assert.equal(p.license, "Apache-2.0");
  for (const f of p.files)
    assert.equal(
      createHash("sha256")
        .update(readFileSync(new URL(f.file, root)))
        .digest("hex"),
      f.sha256,
    );
  assert.equal(p.files.length, 3);
});

test("viewer independent-joint API retains validated mimic follower linkage", () => {
  const independent = {
    parts: ["fr3_hand", "fr3_leftfinger", "fr3_rightfinger"],
    joints: info.joints.filter((j: any) => j.name === "fr3_finger_joint1"),
  };
  assert.deepEqual(gripperRange(independent), { lower: 0, upper: 0.04 });
  assert.deepEqual(gripperCommand(independent, 0.08), {
    fr3_finger_joint1: 0.04,
  });
  assert.equal(gripperRange({ ...independent, parts: [] }), null);
});
