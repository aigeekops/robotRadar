import test from "node:test";
import assert from "node:assert/strict";
import {
  groupVisualInstances,
  visualEvidenceKey,
  type VisualPartInstance,
} from "../../src/core/visualGrouping";
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const part = (id: string): VisualPartInstance => ({
  instanceId: id,
  linkName: id,
  sourceScope: "robot@commit",
  specificationKey: "verified-fastener-M4x8",
  handedness: "neutral",
  sourceWorldMatrix: [...identity],
  visuals: [
    {
      meshUri: "package://robot/bolt.stl",
      scale: [1, 1, 1],
      localMatrix: [...identity],
      material: {
        identity: "steel",
        rgba: [0.7, 0.7, 0.7, 1],
        textureUri: null,
      },
    },
  ],
});
test("exact repeats show one representative × quantity while preserving all source poses", () => {
  const a = part("bolt_1"),
    b = part("bolt_2");
  b.sourceWorldMatrix = [...identity];
  (b.sourceWorldMatrix as number[])[12] = 3;
  const g = groupVisualInstances([a, b]);
  assert.equal(g.length, 1);
  assert.equal(g[0].quantity, 2);
  assert.deepEqual(
    g[0].instances.map((x) => x.instanceId),
    ["bolt_1", "bolt_2"],
  );
  assert.equal(g[0].instances[1].sourceWorldMatrix?.[12], 3);
  (a.visuals[0].scale as number[])[0] = 2;
  assert.equal(g[0].representative.visuals[0].scale[0], 1);
});
test("each source, specification, material, texture, scale, local transform and URI distinction splits", () => {
  const changes: ((p: VisualPartInstance) => void)[] = [
    (p) => (p.sourceScope = "other@commit"),
    (p) => (p.specificationKey = "M4x10"),
    (p) => (p.visuals[0].meshUri = "other.stl"),
    (p) => ((p.visuals[0].scale as number[])[0] = 1.00000001),
    (p) => ((p.visuals[0].localMatrix as number[])[12] = 0.00000001),
    (p) => (p.visuals[0].material!.identity = "aluminium"),
    (p) => ((p.visuals[0].material!.rgba as number[])[0] = 0.71),
    (p) => (p.visuals[0].material!.textureUri = "texture.png"),
  ];
  for (const change of changes) {
    const b = part("bolt_2");
    change(b);
    assert.equal(groupVisualInstances([part("bolt_1"), b]).length, 2);
  }
});
test("left/right and named mirror identities never collapse, even with neutral adapter metadata", () => {
  for (const [a, b] of [
    ["left_arm", "right_arm"],
    ["FL_hip", "FR_hip"],
    ["bolt", "bolt_mirrored"],
    ["leftArm", "rightArm"],
  ])
    assert.equal(groupVisualInstances([part(a), part(b)]).length, 2);
  const b = part("bolt_2");
  b.handedness = "left";
  assert.equal(groupVisualInstances([part("bolt_1"), b]).length, 2);
  const c = part("bolt_3");
  (c.visuals[0].scale as number[])[0] = -1;
  assert.equal(groupVisualInstances([part("bolt_1"), c]).length, 2);
});
test("unknown or invalid evidence remains singleton, including repeated missing material", () => {
  const changes: ((p: VisualPartInstance) => void)[] = [
    (p) => (p.specificationKey = null),
    (p) => (p.handedness = "unknown"),
    (p) => (p.sourceScope = ""),
    (p) => (p.visuals = []),
    (p) => (p.visuals[0].material = null),
    (p) => ((p.visuals[0].scale as number[])[0] = NaN),
    (p) => (p.visuals[0].localMatrix as number[]).pop(),
    (p) => (p.visuals[0].meshUri = ""),
  ];
  for (const change of changes) {
    const a = part("a"),
      b = part("b");
    change(a);
    change(b);
    const g = groupVisualInstances([a, b]);
    assert.equal(g.length, 2);
    assert.ok(g.every((x) => x.basis === "unverified-singleton"));
  }
});
test("visual combinations ignore declaration order but retain every local geometry and multiplicity", () => {
  const a = part("a"),
    b = part("b"),
    v = { ...part("x").visuals[0], meshUri: "washer.stl" };
  a.visuals = [...a.visuals, v];
  b.visuals = [v, ...b.visuals];
  assert.equal(visualEvidenceKey(a), visualEvidenceKey(b));
  b.visuals = [...b.visuals, v];
  assert.notEqual(visualEvidenceKey(a), visualEvidenceKey(b));
});
test("unique source instances and stable input order are mandatory, unsafe IDs are ordinary values", () => {
  assert.throws(() => groupVisualInstances([part("a"), part("a")]));
  assert.throws(() => groupVisualInstances([part("")]));
  const g = groupVisualInstances([part("__proto__"), part("constructor")]);
  assert.equal(g[0].quantity, 2);
  assert.equal(g[0].representative.instanceId, "__proto__");
  assert.deepEqual(groupVisualInstances([]), []);
});
