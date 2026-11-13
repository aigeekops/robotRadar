import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parsePartEvidence } from "../../src/core/partEvidence";
import {
  buildStructureTree,
  structureAncestors,
  visibleVisualCount,
  searchStructureTree,
  structureRows,
  structureLessonIds,
  structureLabel,
} from "../../src/core/structureTree";
import { robotLessons } from "../../src/robotLearning";
const source = (id: string) =>
  parsePartEvidence(readFileSync(`public/robots/${id}/robot.urdf`, "utf8"));
for (const id of [
  "g1",
  "go2",
  "panda",
  "ur5e",
  "fr3",
  "so101",
  "h1",
  "turtlebot3",
])
  test(`${id}: tree contains only every actual source link with exact branch visual counts`, () => {
    const evidence = source(id),
      tree = buildStructureTree(evidence);
    assert.deepEqual(Object.keys(tree.nodes), Object.keys(evidence.links));
    assert.equal(tree.linkCount, Object.keys(evidence.links).length);
    assert.equal(
      tree.visualCount,
      Object.values(evidence.links).reduce((n, l) => n + l.visualCount, 0),
    );
    for (const node of Object.values(tree.nodes)) {
      const expected = [node.id];
      for (let i = 0; i < expected.length; i++)
        for (const joint of evidence.joints.filter(
          (j) => j.parent === expected[i],
        ))
          expected.push(joint.child);
      assert.deepEqual(new Set(node.descendantIds), new Set(expected));
      assert.equal(node.descendantIds.length, new Set(node.descendantIds).size);
      assert.equal(
        node.visualCount,
        expected.reduce((n, id) => n + evidence.links[id].visualCount, 0),
      );
      if (node.parent)
        assert.ok(
          evidence.joints.some(
            (j) => j.parent === node.parent && j.child === node.id,
          ),
        );
    }
    assert.equal(
      structureRows(tree, new Set(Object.keys(tree.nodes))).length,
      tree.linkCount,
    );
  });
test("G1 source left-leg branch, zero-geometry frames and local visibility remain distinct", () => {
  const tree = buildStructureTree(source("g1")),
    leg = tree.nodes.left_hip_pitch_link;
  assert.equal(leg.descendantIds.length, 6);
  assert.equal(leg.visualCount, 6);
  assert.ok(!leg.descendantIds.includes("right_knee_link"));
  assert.equal(tree.nodes.imu_in_torso.visualCount, 0);
  assert.equal(
    visibleVisualCount(tree, leg.descendantIds, ["left_hip_pitch_link"]),
    5,
  );
  assert.equal(
    visibleVisualCount(
      tree,
      ["left_knee_link", "left_knee_link", "missing"],
      [],
    ),
    1,
  );
});
test("search preserves only real ancestors and matches joint names, normalized text and truthful labels", () => {
  const tree = buildStructureTree(source("g1"));
  const labels = Object.fromEntries(
    Object.keys(tree.nodes).map((id) => [id, structureLabel(id, "zh")]),
  );
  const result = searchStructureTree(tree, "left_knee_joint");
  assert.ok(result.matched.has("left_knee_link"));
  assert.deepEqual(
    new Set(result.visible),
    new Set([...structureAncestors(tree, "left_knee_link"), "left_knee_link"]),
  );
  const rows = structureRows(tree, new Set(), result);
  assert.equal(rows.at(-1)?.node.id, "left_knee_link");
  const translated = searchStructureTree(tree, "左腿 髋", labels);
  assert.ok(translated.matched.has("left_hip_pitch_link"));
  assert.equal(
    searchStructureTree(tree, "ｐｅｌｖｉｓ").matched.has("pelvis"),
    true,
  );
  assert.equal(searchStructureTree(tree, "PCB-wiring-fiction").matched.size, 0);
  assert.equal(searchStructureTree(tree, "   ").query, "");
});
test("course links are scoped to actual branch membership and selected robot", () => {
  const g1 = buildStructureTree(source("g1")),
    go2 = buildStructureTree(source("go2"));
  const ids = structureLessonIds(
    g1.nodes.left_hip_pitch_link,
    "g1",
    robotLessons,
  );
  assert.ok(ids.length > 0);
  assert.ok(
    ids.every((id) =>
      robotLessons.some(
        (l) =>
          l.id === id &&
          l.robotId === "g1" &&
          l.partIds.some((p) =>
            g1.nodes.left_hip_pitch_link.descendantIds.includes(p),
          ),
      ),
    ),
  );
  assert.equal(
    structureLessonIds(go2.nodes.FL_hip, "g1", robotLessons).length,
    0,
  );
});
test("invalid second parent, cycles, visual counts and prototype identifiers cannot fabricate a tree", () => {
  const good = parsePartEvidence(
    '<robot><link name="__proto__"/><link name="constructor"/><joint name="j" type="fixed"><parent link="__proto__"/><child link="constructor"/></joint></robot>',
  );
  const tree = buildStructureTree(good);
  assert.equal(tree.nodes.__proto__.id, "__proto__");
  assert.deepEqual(tree.roots, ["__proto__"]);
  assert.equal(searchStructureTree(tree, "object").matched.size, 0);
  assert.throws(() =>
    buildStructureTree({
      ...good,
      joints: [...good.joints, { ...good.joints[0], name: "duplicate" }],
    }),
  );
  const cycle = {
    ...good,
    joints: [
      ...good.joints,
      {
        ...good.joints[0],
        name: "back",
        parent: "constructor",
        child: "__proto__",
      },
    ],
  };
  assert.throws(() => buildStructureTree(cycle));
  const bad = parsePartEvidence('<robot><link name="a"/></robot>');
  bad.links.a.visualCount = -1;
  assert.throws(() => buildStructureTree(bad));
});
