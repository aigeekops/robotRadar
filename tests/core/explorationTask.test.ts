import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { RobotEntry, ModelInfo } from "../../src/types";
import { parsePartEvidence } from "../../src/core/partEvidence";
import {
  createExplorationTask,
  startExploration,
  idleExploration,
  observeExploration,
  restoreExploration,
  serializeExploration,
} from "../../src/core/explorationTask";
const robots: RobotEntry[] = JSON.parse(
  readFileSync("public/robots/manifest.json", "utf8"),
);
function prepare(robot: RobotEntry) {
  const xml = readFileSync("public" + robot.urdfUrl, "utf8");
  const source = parsePartEvidence(xml);
  const info: ModelInfo = {
    parts: Object.keys(source.links),
    joints: source.joints
      .filter((j) => !j.mimic && j.type !== "fixed")
      .map((j) => ({
        name: j.name,
        type: j.type,
        lower: j.type === "continuous" ? -Math.PI : j.lower!,
        upper: j.type === "continuous" ? Math.PI : j.upper!,
        value: 0,
      })),
  };
  const digest = createHash("sha256").update(xml).digest("hex");
  return {
    xml,
    info,
    digest,
    source,
    task: createExplorationTask(robot, info, xml, digest),
  };
}
for (const robot of robots)
  test(`${robot.id}: task uses a verified visual child and reachable independent effective target`, () => {
    const { task, source } = prepare(robot);
    const joint = source.joints.find((j) => j.name === task.joint)!;
    assert.equal(joint.child, task.link);
    assert.equal(!!joint.mimic, false);
    assert.notEqual(joint.type, "fixed");
    assert.ok(source.links[task.link].visualCount > 0);
    assert.ok(task.target >= task.lower && task.target <= task.upper);
    assert.ok(Math.abs(task.target) > 2 * task.tolerance);
    const step = task.unit === "m" ? 0.001 : 0.01;
    const quantized =
      task.lower + Math.round((task.target - task.lower) / step) * step;
    assert.ok(Math.abs(quantized - task.target) <= task.tolerance);
    assert.ok(task.tolerance >= step * 0.6);
  });
const robot = robots.find((r) => r.id === "g1")!;
test("three-step task only advances from observed selection, target movement and zero return", () => {
  const { task } = prepare(robot);
  let state = startExploration(task);
  state = observeExploration(task, state, {
    selected: null,
    value: task.target,
    mode: "joints",
  });
  assert.equal(state.phase, "select");
  state = observeExploration(task, state, {
    selected: task.link,
    value: 0,
    mode: "parts",
  });
  assert.equal(state.phase, "move");
  state = observeExploration(task, state, {
    selected: task.link,
    value: task.target,
    mode: "joints",
  });
  assert.equal(state.phase, "move");
  state = observeExploration(task, state, {
    selected: task.link,
    value: 0,
    mode: "joints",
  });
  assert.equal(state.armed, true);
  state = observeExploration(task, state, {
    selected: task.link,
    value: task.target + task.tolerance * 0.4,
    mode: "joints",
  });
  assert.equal(state.phase, "reset");
  state = observeExploration(task, state, {
    selected: null,
    value: task.tolerance * 0.2,
    mode: "joints",
  });
  assert.equal(state.phase, "complete");
  const serialized = serializeExploration(task, state)!;
  assert.equal(restoreExploration(task, serialized).phase, "complete");
});
test("invalid observations, partial records and manual completion flags never complete a task", () => {
  const { task } = prepare(robot);
  let state = startExploration(task);
  for (const value of [NaN, Infinity, task.upper + 1])
    assert.equal(
      observeExploration(task, state, {
        selected: task.link,
        value,
        mode: "parts",
      }),
      state,
    );
  assert.equal(serializeExploration(task, state), null);
  for (const raw of [
    null,
    "garbage",
    '{"complete":true}',
    JSON.stringify({ key: task.key, version: 1, evidence: [] }),
    JSON.stringify({
      key: task.key,
      version: 1,
      evidence: [{ mode: "parts", selected: task.link, value: 0 }],
    }),
  ])
    assert.equal(restoreExploration(task, raw).phase, "idle");
});
test("records isolate robot, source commit, source bytes and task version; mismatched loaded models fail closed", () => {
  const { task, xml, info, digest } = prepare(robot);
  const other = createExplorationTask(
    { ...robot, sourceCommit: "changed" },
    info,
    xml,
    digest,
  );
  assert.notEqual(task.key, other.key);
  assert.equal(
    observeExploration(other, startExploration(task), {
      selected: task.link,
      value: 0,
      mode: "parts",
    }).phase,
    "idle",
  );
  assert.notEqual(
    createExplorationTask(robot, info, xml, "a".repeat(64)).key,
    task.key,
  );
  assert.throws(() =>
    createExplorationTask(robot, { ...info, parts: [] }, xml, digest),
  );
  assert.throws(() =>
    createExplorationTask(
      robot,
      {
        ...info,
        joints: info.joints.map((j) => ({ ...j, upper: j.upper + 0.1 })),
      },
      xml,
      digest,
    ),
  );
  assert.equal(
    restoreExploration(
      task,
      JSON.stringify({ key: task.key, version: 999, evidence: [] }),
    ).phase,
    "idle",
  );
});
test("cancel/restart is independent of unavailable storage and never changes model state", () => {
  const { task } = prepare(robot);
  let session = idleExploration(task);
  session = startExploration(task);
  session = observeExploration(task, session, {
    selected: task.link,
    value: 0,
    mode: "parts",
  });
  assert.equal(session.phase, "move");
  session = idleExploration(task);
  assert.equal(session.phase, "idle");
  assert.deepEqual(session.evidence, []);
  assert.equal(startExploration(task).phase, "select");
});

test("teaching metadata is copied from the selected source joint without changing task identity or progression", () => {
  for (const robot of robots) {
    const { task, source } = prepare(robot);
    const joint = source.joints.find((j) => j.name === task.joint)!;
    assert.equal(task.parent, joint.parent);
    assert.equal(task.jointType, joint.type);
    assert.deepEqual(
      task.axis,
      joint.axis && joint.axis.some((v) => v !== 0) ? joint.axis : null,
    );
    assert.equal(task.version, 1);
  }
});
test("missing or invalid local axis stays explicitly unknown instead of guessing URDF defaults", () => {
  const fixture = { ...robot, id: "axis-fixture", sourceCommit: "fixture" };
  const info: ModelInfo = {
    parts: ["parent", "child"],
    joints: [
      { name: "drive", type: "revolute", lower: -1, upper: 1, value: 0 },
    ],
  };
  for (const axis of ["", '<axis xyz="0 0 0"/>', '<axis xyz="bad 0 1"/>']) {
    const xml = `<robot name="test"><link name="parent"/><link name="child"><visual><geometry><box size="1 1 1"/></geometry></visual></link><joint name="drive" type="revolute"><parent link="parent"/><child link="child"/>${axis}<limit lower="-1" upper="1"/></joint></robot>`;
    const task = createExplorationTask(
      fixture,
      info,
      xml,
      createHash("sha256").update(xml).digest("hex"),
    );
    assert.equal(task.axis, null);
    assert.equal(task.parent, "parent");
    assert.equal(task.jointType, "revolute");
  }
});
