import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import {
  createExperimentTemplate,
  experimentJoints,
  parseExperimentJoints,
  parseMotionProgram,
  experimentTemplateFilename,
} from "../../src/core/experimentTemplate";
import { handDefinitionForRobot } from "../../src/core/handRegistry";
import { handFollowerPose } from "../../src/core/handLab";
import type { JointInfo, RobotEntry } from "../../src/types";
const robots: RobotEntry[] = JSON.parse(
  readFileSync("public/robots/manifest.json", "utf8"),
);
const source = (robot: RobotEntry): JointInfo[] =>
  JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        `import json,sys,xml.etree.ElementTree as E,math
r=E.parse(sys.argv[1]).getroot();out=[]
for j in r.findall('joint'):
 if j.get('type')=='fixed' or j.find('mimic') is not None:continue
 l=j.find('limit');c=j.get('type')=='continuous'
 out.append(dict(name=j.get('name'),type=j.get('type'),lower=-math.pi if c else float(l.get('lower')),upper=math.pi if c else float(l.get('upper')),value=0))
print(json.dumps(out))`,
        "public" + robot.urdfUrl,
      ],
      { encoding: "utf8" },
    ),
  );
for (const robot of robots)
  test(`${robot.id}: template matches import envelope and source independent limits without execution`, () => {
    const joints = source(robot);
    const result = createExperimentTemplate(robot, joints);
    assert.equal(result.schemaVersion, 1);
    assert.equal(result.robotId, robot.id);
    assert.equal(result.sourceCommit, robot.sourceCommit);
    assert.equal(result.urdfUrl, robot.urdfUrl);
    assert.equal(typeof result.program, "string");
    assert.deepEqual(result.trace, []);
    assert.ok(Buffer.byteLength(JSON.stringify(result)) < 100000);
    const frames = parseMotionProgram(result.program, joints);
    assert.deepEqual(
      frames.map((f) => f.time),
      [0, 2, 4],
    );
    assert.deepEqual(frames[0].joints, frames[2].joints);
    const changed = Object.keys(frames[0].joints).filter(
      (n) => frames[0].joints[n] !== frames[1].joints[n],
    );
    assert.equal(changed.length, 1);
    for (const frame of frames)
      for (const [name, v] of Object.entries(frame.joints)) {
        const j = joints.find((j) => j.name === name)!;
        assert.ok(j && v >= j.lower && v <= j.upper);
      }
    const hand = handDefinitionForRobot(robot.id);
    if (hand)
      for (const f of frames) {
        const all = handFollowerPose(hand, f.joints);
        for (const j of hand.joints)
          assert.ok(
            all[j.name] >= j.lower - 1e-9 && all[j.name] <= j.upper + 1e-9,
            j.name,
          );
      }
    assert.equal(
      experimentTemplateFilename(robot),
      `${robot.id}-experiment-template.json`,
    );
  });
test("program validator rejects malformed, unknown, nonmonotonic and out-of-limit frames", () => {
  const joints: JointInfo[] = [
    { name: "q", type: "revolute", lower: -1, upper: 1, value: 0 },
  ];
  for (const frames of [
    null,
    [],
    [{ time: 0, joints: { q: 0 } }],
    [
      { time: 1, joints: {} },
      { time: 2, joints: {} },
    ],
    [
      { time: 0, joints: {} },
      { time: 0, joints: {} },
    ],
    [
      { time: 0, joints: {} },
      { time: 61, joints: {} },
    ],
    [
      { time: 0, joints: {} },
      { time: 1, joints: { unknown: 0 } },
    ],
    [
      { time: 0, joints: {} },
      { time: 1, joints: { q: 2 } },
    ],
    [
      { time: 0, joints: [] },
      { time: 1, joints: {} },
    ],
  ])
    assert.throws(() => parseMotionProgram(JSON.stringify({ frames }), joints));
  assert.throws(() => parseMotionProgram("x".repeat(100001), joints));
  assert.throws(() => parseMotionProgram("null", joints));
});
test("templates fail closed without loaded joints or pinned source revision", () => {
  assert.throws(() => createExperimentTemplate(robots[0], []));
  assert.throws(() =>
    createExperimentTemplate(
      { ...robots[0], sourceCommit: undefined },
      source(robots[0]),
    ),
  );
});

test("SVH effective experiment limits reject raw-valid commands that would exceed follower limits", () => {
  const robot = robots.find((r) => r.id === "svh_hand")!;
  const raw = source(robot),
    effective = experimentJoints(robot, raw);
  const restricted = effective.find(
    (j) => j.upper < raw.find((r) => r.name === j.name)!.upper - 1e-6,
  )!;
  assert.ok(restricted);
  const rawJoint = raw.find((j) => j.name === restricted.name)!;
  const program = JSON.stringify({
    frames: [
      { time: 0, joints: {} },
      {
        time: 1,
        joints: { [restricted.name]: (restricted.upper + rawJoint.upper) / 2 },
      },
    ],
  });
  assert.doesNotThrow(() => parseMotionProgram(program, raw));
  assert.throws(() => parseMotionProgram(program, effective));
  assert.throws(() =>
    experimentJoints({ ...robot, sourceCommit: "0".repeat(40) }, raw),
  );
});

test("target URDF parser excludes fixed/mimic and matches effective teaching limits for all catalog models", () => {
  for (const robot of robots) {
    const actual = parseExperimentJoints(
      robot,
      readFileSync("public" + robot.urdfUrl, "utf8"),
    );
    const expected = experimentJoints(robot, source(robot));
    assert.deepEqual(actual, expected);
    const template = createExperimentTemplate(robot, source(robot));
    assert.doesNotThrow(() => parseMotionProgram(template.program, actual));
  }
  const g1 = robots.find((r) => r.id === "g1")!,
    panda = robots.find((r) => r.id === "panda")!;
  assert.throws(() =>
    parseMotionProgram(
      createExperimentTemplate(g1, source(g1)).program,
      parseExperimentJoints(
        panda,
        readFileSync("public" + panda.urdfUrl, "utf8"),
      ),
    ),
  );
  assert.throws(() => parseExperimentJoints(g1, "<!DOCTYPE robot><robot/>"));
});
