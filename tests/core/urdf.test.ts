import test from "node:test";
import assert from "node:assert/strict";
import { isMimicJoint } from "../../src/core/urdf.ts";
test("mimic detection supports the installed 0.12 class and newer markers", () => {
  assert.equal(
    isMimicJoint({ type: "URDFMimicJoint", mimicJoint: "finger_joint1" }),
    true,
  );
  assert.equal(isMimicJoint({ mimicJoint: "finger_joint1" }), true);
  assert.equal(isMimicJoint({ isURDFMimicJoint: true }), true);
  assert.equal(isMimicJoint({ type: "URDFJoint" }), false);
  assert.equal(isMimicJoint({ mimicJoint: null }), false);
});
