import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const root = new URL("../../public/robots/", import.meta.url);
for (const [id, joints, links] of [
  ["h1", 19, 25],
  ["turtlebot3", 2, 7],
] as const) {
  test(`${id}: fixed official source, per-asset licence/hash and truthful boundaries`, () => {
    const manifest = JSON.parse(
      readFileSync(new URL("manifest.json", root), "utf8"),
    );
    const entry = manifest.find((x: { id: string }) => x.id === id);
    assert.ok(entry);
    const p = JSON.parse(
      readFileSync(new URL(`${id}/provenance.json`, root), "utf8"),
    );
    assert.match(p.commit, /^[a-f0-9]{40}$/);
    assert.equal(p.commit, entry.sourceCommit);
    assert.equal(entry.jointCount, joints);
    assert.equal(entry.linkCount, links);
    assert.ok(p.licenseAudit.evidence.length >= 2);
    assert.match(entry.limitations.en, /No integrated|No ROS/);
    for (const file of p.files) {
      assert.equal(file.license, entry.license);
      assert.ok(file.licenseEvidence.length >= 2);
      assert.ok(file.sourceUrl.includes(p.commit));
      assert.equal(
        createHash("sha256")
          .update(readFileSync(new URL(`${id}/${file.file}`, root)))
          .digest("hex"),
        file.sha256,
      );
    }
    for (const notice of p.distributionNotices)
      assert.ok(readFileSync(new URL(`${id}/${notice}`, root)).length > 0);
  });
}

test("new robot pose previews change only valid, bounded source joints", async () => {
  const { directPresets, sampleDirectMotion } =
    await import("../../src/core/directMotion");
  for (const id of ["h1", "turtlebot3"]) {
    const p = JSON.parse(
      readFileSync(new URL(`${id}/provenance.json`, root), "utf8"),
    );
    const joints = p.joints
      .filter((j: any) => j.type !== "fixed")
      .map((j: any) => ({
        name: j.id,
        type: j.type,
        value: 0,
        lower: j.type === "continuous" ? -Math.PI : Number(j.limit.lower),
        upper: j.type === "continuous" ? Math.PI : Number(j.limit.upper),
      }));
    const presets = directPresets(id, joints);
    const expected =
      id === "h1"
        ? ["arm-pose", "torso-pose", "look-and-present", "alternating-reach"]
        : ["wheel-pose", "differential-pose", "single-wheel-comparison"];
    assert.deepEqual(presets.map((p) => p.id).sort(), expected.sort());
    for (const preset of presets) {
      const sample = sampleDirectMotion(preset, 0.4);
      assert.deepEqual(
        Object.keys(sample).sort(),
        joints.map((j: any) => j.name).sort(),
      );
      assert.ok(Object.values(sample).some((n) => Math.abs(n) > 0.01));
      for (const joint of joints)
        assert.ok(
          sample[joint.name] >= joint.lower &&
            sample[joint.name] <= joint.upper,
        );
    }
  }
});
