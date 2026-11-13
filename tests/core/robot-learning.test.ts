import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  robotLessons,
  chainExercises,
  robotLearningSources,
  type RobotId,
} from "../../src/robotLearning.ts";
import { validateAssembly } from "../../src/core/assembly.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const robotIds: RobotId[] = ["g1", "go2", "panda", "ur5e", "fr3", "so101"];
interface JointRecord {
  id: string;
  type: string;
  parent: string;
  child: string;
  limit: Record<string, string>;
  mimic: Record<string, string> | null;
  axis: string;
  origin: Record<string, string>;
}
interface ModelRecord {
  links: string[];
  joints: JointRecord[];
}
// Parse the actual shipped XML with Python's standard XML parser, not copied IDs.
const models = JSON.parse(
  execFileSync(
    "python3",
    [
      "-c",
      `import json, pathlib, xml.etree.ElementTree as E
root = pathlib.Path('public/robots')
result = {}
for robot in ['g1', 'go2', 'panda', 'ur5e', 'fr3', 'so101']:
    xml = E.parse(root / robot / 'robot.urdf').getroot()
    result[robot] = {'links': [x.attrib['name'] for x in xml.findall('link')], 'joints': [
        {'id': x.attrib['name'], 'type': x.attrib['type'],
         'parent': x.find('parent').attrib['link'], 'child': x.find('child').attrib['link'],
         'axis': x.find('axis').get('xyz') if x.find('axis') is not None else '',
         'origin': dict(x.find('origin').attrib) if x.find('origin') is not None else {},
         'limit': dict(x.find('limit').attrib) if x.find('limit') is not None else {},
         'mimic': dict(x.find('mimic').attrib) if x.find('mimic') is not None else None}
        for x in xml.findall('joint')]}
print(json.dumps(result))`,
    ],
    { cwd: root, encoding: "utf8" },
  ),
) as Record<RobotId, ModelRecord>;

function assertBilingual(value: { zh: string; en: string }): void {
  assert.ok(value.zh.trim().length > 0);
  assert.ok(value.en.trim().length > 0);
  assert.notEqual(value.zh, value.en);
}

test("robot learning provides 20 unique lessons across all six models", () => {
  assert.equal(robotLessons.length, 20);
  assert.equal(new Set(robotLessons.map((item) => item.id)).size, 20);
  for (const robotId of robotIds) {
    const count = robotLessons.filter(
      (item) => item.robotId === robotId,
    ).length;
    assert.ok(count >= 3 && count <= 4);
  }
});

test("all lesson part and joint IDs exist in the actual shipped URDF", () => {
  for (const lesson of robotLessons) {
    const model = models[lesson.robotId];
    assert.ok(lesson.partIds.length > 0);
    assert.ok(lesson.jointIds.length > 0);
    assert.equal(new Set(lesson.partIds).size, lesson.partIds.length);
    assert.equal(new Set(lesson.jointIds).size, lesson.jointIds.length);
    for (const id of lesson.partIds) {
      assert.ok(model.links.includes(id), `${lesson.id}: missing link ${id}`);
    }
    for (const id of lesson.jointIds) {
      const joint = model.joints.find((item) => item.id === id);
      assert.ok(joint, `${lesson.id}: missing joint ${id}`);
      assert.ok(
        lesson.partIds.includes(joint.child),
        `${lesson.id}: joint child not associated`,
      );
    }
  }
});

test("lesson prose and exercise prose have complete bilingual values", () => {
  for (const lesson of robotLessons) {
    for (const value of [
      lesson.title,
      lesson.summary,
      lesson.body,
      lesson.task,
    ]) {
      assertBilingual(value);
    }
  }
  for (const exercise of chainExercises) {
    assertBilingual(exercise.title);
    assertBilingual(exercise.disclaimer);
    assert.match(exercise.disclaimer.zh, /不是真机维修装配/);
    assert.match(exercise.disclaimer.en, /not physical service assembly/);
    for (const step of exercise.steps) {
      assertBilingual(step.title);
      assertBilingual(step.body);
    }
  }
});

test("every source is pinned to the asset provenance commit and actual source file", () => {
  for (const robotId of robotIds) {
    const provenance = JSON.parse(
      readFileSync(`${root}/public/robots/${robotId}/provenance.json`, "utf8"),
    );
    const url = new URL(robotLearningSources[robotId]);
    assert.equal(url.protocol, "https:");
    assert.equal(url.hostname, "github.com");
    assert.ok(url.pathname.includes(`/blob/${provenance.commit}/`));
    assert.ok(url.pathname.endsWith(provenance.sourceFile));
  }
  for (const lesson of robotLessons) {
    assert.equal(lesson.sourceUrl, robotLearningSources[lesson.robotId]);
  }
  for (const exercise of chainExercises) {
    for (const step of exercise.steps) {
      assert.equal(step.sourceUrl, robotLearningSources[exercise.robotId]);
    }
  }
});

test("six chain exercises have valid IDs, a DAG, and four to seven steps", () => {
  assert.deepEqual(
    chainExercises.map((item) => item.robotId).sort(),
    [...robotIds].sort(),
  );
  const allIds = new Set<string>();
  for (const exercise of chainExercises) {
    assert.ok(exercise.steps.length >= 4 && exercise.steps.length <= 7);
    assert.deepEqual(validateAssembly(exercise.steps), []);
    const earlier = new Set<string>();
    for (const step of exercise.steps) {
      assert.ok(!allIds.has(step.id));
      allIds.add(step.id);
      for (const dependency of step.prerequisites)
        assert.ok(earlier.has(dependency));
      earlier.add(step.id);
      for (const id of step.partIds) {
        assert.ok(
          models[exercise.robotId].links.includes(id),
          `${step.id}: missing link ${id}`,
        );
      }
    }
  }
});

test("chain reconstruction follows real parent-child connections without skipped parents", () => {
  for (const exercise of chainExercises) {
    const model = models[exercise.robotId];
    const parentOf = new Map(
      model.joints.map((joint) => [joint.child, joint.parent]),
    );
    const revealed = new Set<string>();
    for (const step of exercise.steps) {
      const group = new Set(step.partIds);
      assert.equal(group.size, step.partIds.length);
      for (const part of group) {
        assert.ok(!revealed.has(part), `${step.id}: duplicate part ${part}`);
        const parent = parentOf.get(part);
        assert.ok(
          !parent || group.has(parent) || revealed.has(parent),
          `${step.id}: ${part} skips parent ${parent}`,
        );
      }
      for (const part of group) revealed.add(part);
    }
  }
});

test("specific teaching claims match imported joint metadata", () => {
  const joint = (robot: RobotId, id: string) => {
    const result = models[robot].joints.find((item) => item.id === id);
    assert.ok(result);
    return result;
  };
  assert.equal(joint("g1", "head_joint").type, "fixed");
  assert.equal(joint("g1", "waist_yaw_joint").type, "revolute");
  assert.equal(joint("go2", "FL_foot_joint").type, "fixed");
  assert.equal(Number(joint("go2", "FL_thigh_joint").limit.lower), -1.5708);
  assert.equal(Number(joint("go2", "FL_thigh_joint").limit.upper), 3.4907);
  assert.equal(Number(joint("go2", "RL_thigh_joint").limit.lower), -0.5236);
  assert.equal(Number(joint("go2", "RL_thigh_joint").limit.upper), 4.5379);
  assert.equal(
    joint("panda", "panda_finger_joint2").mimic?.joint,
    "panda_finger_joint1",
  );
  assert.equal(joint("panda", "panda_finger_joint1").type, "prismatic");
  assert.equal(Number(joint("panda", "panda_finger_joint1").limit.upper), 0.04);
  assert.equal(joint("ur5e", "flange-tool0").type, "fixed");
  assert.equal(joint("so101", "gripper").type, "revolute");
  assert.equal(joint("so101", "gripper_frame_joint").type, "fixed");
  assert.ok(models.so101.joints.every((item) => item.mimic === null));
  assert.equal(
    models.so101.joints.filter((item) => item.type === "revolute").length,
    6,
  );
  assert.equal(Number(joint("fr3", "fr3_joint4").limit.lower), -3.077);
  assert.equal(Number(joint("fr3", "fr3_joint4").limit.upper), -0.1169);
  assert.equal(Number(joint("fr3", "fr3_joint6").limit.lower), 0.4398);
  assert.equal(Number(joint("fr3", "fr3_joint6").limit.upper), 4.6216);
  assert.equal(
    joint("fr3", "fr3_finger_joint2").mimic?.joint,
    "fr3_finger_joint1",
  );
  assert.equal(joint("fr3", "fr3_finger_joint1").axis, "0 1 0");
  assert.equal(joint("fr3", "fr3_finger_joint2").axis, "0 1 0");
  assert.ok(
    Math.abs(
      Number(joint("fr3", "fr3_finger_joint2").origin.rpy.split(" ")[2]) -
        Math.PI,
    ) < 1e-10,
  );
  assert.equal(joint("fr3", "fr3_hand_tcp_joint").type, "fixed");
  assert.equal(
    models.fr3.joints.filter((item) => item.type === "revolute").length,
    7,
  );
  assert.equal(
    models.ur5e.joints.filter((item) => item.type === "revolute").length,
    6,
  );
  assert.equal(
    models.panda.joints.filter((item) => item.type === "revolute").length,
    7,
  );
});
