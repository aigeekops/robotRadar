import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { adaptUrdfVisuals } from "../../src/core/urdfVisualEvidence";
const source = {
  robotId: "fixture",
  sourceCommit: "a".repeat(40),
  urdfUri: "/fixture.urdf",
};
const visual = (attrs = "", origin = "", material = "") =>
  `<visual>${origin}<geometry><mesh filename="part.stl" ${attrs}/></geometry>${material}</visual>`;
const model = (a: string, b = a, names = ["copy_1", "copy_2"]) =>
  `<robot name="r"><link name="${names[0]}">${a}</link><link name="${names[1]}">${b}</link></robot>`;
test("source-only copies merge without invented physical specification and retain every instance", () => {
  const a = adaptUrdfVisuals(model(visual()), source);
  assert.equal(a.groups.length, 1);
  assert.equal(a.groups[0].quantity, 2);
  assert.equal(a.instances[0].specificationKey, null);
  assert.equal(a.instances[0].identityBasis, "source-visuals");
});
test("URDF defaults, declared material resolution, complete material sets and exact origins", () => {
  assert.equal(
    adaptUrdfVisuals(
      model(
        visual(),
        visual('scale="1 1 1"', '<origin xyz="0 0 0" rpy="0 0 0"/>'),
      ),
      source,
    ).groups.length,
    1,
  );
  const inline = '<material name="m"><color rgba=".5 .5 .5 1"/></material>';
  const text = model(
    visual("", "", inline),
    visual("", "", '<material name="m"/>'),
  ).replace('<robot name="r">', `<robot name="r">${inline}`);
  assert.equal(adaptUrdfVisuals(text, source).groups.length, 1);
  for (const other of [
    visual('scale="-1 1 1"'),
    visual("", '<origin xyz="0.000001 0 0"/>'),
    visual("", "", inline),
    visual(
      "",
      "",
      inline + '<material name="extra"><texture filename="x.png"/></material>',
    ),
  ])
    assert.equal(
      adaptUrdfVisuals(model(visual(), other), source).groups.length,
      2,
    );
});
test("left and right composite names stay separate; same-side front/rear exact copies may group", () => {
  for (const names of [
    ["fr3_leftfinger", "fr3_rightfinger"],
    ["FL_foot", "FR_foot"],
  ])
    assert.equal(
      adaptUrdfVisuals(model(visual(), visual(), names), source).groups.length,
      2,
    );
  assert.equal(
    adaptUrdfVisuals(model(visual(), visual(), ["FL_foot", "RL_foot"]), source)
      .groups.length,
    1,
  );
});
test("unresolved, malformed, unsupported, primitive and empty visuals stay singleton; unsafe XML rejected", () => {
  for (const v of [
    visual("", "", '<material name="missing"/>'),
    visual('scale="NaN 1 1"'),
    '<visual><geometry><sphere radius="1"/></geometry></visual>',
    "",
    visual("", "", '<material name="bad"><color rgba="NaN 0 0 1"/></material>'),
  ]) {
    const a = adaptUrdfVisuals(model(v), source);
    assert.equal(a.groups.length, 2);
    assert.equal(a.exclusions.length, 2);
  }
  assert.throws(() =>
    adaptUrdfVisuals("<!DOCTYPE x>" + model(visual()), source),
  );
  assert.throws(() =>
    adaptUrdfVisuals(model(visual()), { ...source, sourceCommit: "latest" }),
  );
});
const manifest = JSON.parse(
  readFileSync("public/robots/manifest.json", "utf8"),
);
for (const robot of manifest)
  test(`${robot.id}: actual pinned visual grouping retains every real source instance`, () => {
    const a = adaptUrdfVisuals(readFileSync(`public${robot.urdfUrl}`, "utf8"), {
      robotId: robot.id,
      sourceCommit: robot.sourceCommit,
      urdfUri: robot.urdfUrl,
    });
    assert.equal(a.instances.length, robot.linkCount);
    assert.equal(
      a.groups.reduce((n, g) => n + g.quantity, 0),
      a.instances.length,
    );
    for (const g of a.groups) {
      assert.equal(new Set(g.instances.map((p) => p.handedness)).size, 1);
      assert.equal(g.instances.length, g.quantity);
    }
    if (robot.id === "go2") {
      const g = a.groups.find((g) =>
        g.instances.some((p) => p.instanceId === "FL_thigh"),
      );
      assert.deepEqual(
        g?.instances.map((p) => p.instanceId),
        ["FL_thigh", "RL_thigh"],
      );
    }
    if (robot.id === "fr3")
      assert.notEqual(
        a.groups.find((g) =>
          g.instances.some((p) => p.instanceId === "fr3_leftfinger"),
        ),
        a.groups.find((g) =>
          g.instances.some((p) => p.instanceId === "fr3_rightfinger"),
        ),
      );
  });
