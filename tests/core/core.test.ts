import test from "node:test";
import assert from "node:assert/strict";
import {
  clampJoint,
  degreesToRadians,
  radiansToDegrees,
} from "../../src/core/kinematics.ts";
import {
  validateAssembly,
  availableSteps,
  completeStep,
  undoStep,
} from "../../src/core/assembly.ts";
import { scoreQuiz } from "../../src/core/quiz.ts";
import { filterCatalog } from "../../src/core/catalog.ts";
import { validateCatalog } from "../../src/core/content.ts";
import {
  emptyProgress,
  restoreProgress,
  progressKey,
  loadProgress,
  saveProgress,
  clearProgress,
} from "../../src/core/progress.ts";

const steps = [
  { id: "shell", prerequisites: [], partIds: ["shell"] },
  { id: "connector", prerequisites: ["shell"], partIds: ["connector"] },
  { id: "board", prerequisites: ["connector"], partIds: ["board"] },
];
test("bounded joints respect documented limits", () => {
  assert.equal(clampJoint(10, "revolute", { lower: -1, upper: 2 }), 2);
  assert.equal(clampJoint(-10, "prismatic", { lower: 0, upper: 1 }), 0);
  assert.equal(clampJoint(0.5, "revolute", { lower: -1, upper: 2 }), 0.5);
});
test("fixed and continuous joints have distinct semantics", () => {
  assert.equal(clampJoint(3, "fixed"), 0);
  assert.equal(clampJoint(10 * Math.PI, "continuous"), 10 * Math.PI);
});
test("invalid limits and non-finite values rejected", () => {
  assert.throws(() => clampJoint(1, "revolute"));
  assert.throws(() => clampJoint(1, "revolute", { lower: 2, upper: 1 }));
  assert.throws(() => clampJoint(Infinity, "continuous"));
});
test("angle conversion round trips", () => {
  assert.ok(Math.abs(radiansToDegrees(degreesToRadians(123)) - 123) < 1e-10);
  assert.equal(degreesToRadians(180), Math.PI);
});
test("assembly sequence enforces prerequisites", () => {
  assert.deepEqual(validateAssembly(steps), []);
  assert.deepEqual(
    availableSteps(steps, []).map((s) => s.id),
    ["shell"],
  );
  assert.throws(() => completeStep(steps, [], "board"));
  assert.deepEqual(completeStep(steps, ["shell"], "connector"), [
    "shell",
    "connector",
  ]);
  assert.deepEqual(completeStep(steps, ["shell"], "shell"), ["shell"]);
});
test("assembly rejects cycles, duplicate and missing IDs", () => {
  assert.ok(
    validateAssembly([{ id: "a", prerequisites: ["a"], partIds: ["a"] }])
      .length,
  );
  assert.ok(validateAssembly([steps[0], steps[0]]).length);
  assert.ok(
    validateAssembly([{ id: "a", prerequisites: ["b"], partIds: ["a"] }])
      .length,
  );
});
test("undo invalidates all descendants", () => {
  assert.deepEqual(
    undoStep(steps, ["shell", "connector", "board"], "connector"),
    ["shell"],
  );
});
test("malformed restored assembly history cannot advance", () => {
  assert.throws(() => completeStep(steps, ["board"], "shell"));
  assert.throws(() => completeStep(steps, ["unknown"], "shell"));
});
const questions = [
  { id: "q1", options: ["a", "b"], correctOption: 1 },
  { id: "q2", options: ["a", "b"], correctOption: 0 },
];
test("quiz scores answered, unanswered and incorrect separately", () => {
  const result = scoreQuiz(questions, { q1: 1 });
  assert.equal(result.correct, 1);
  assert.equal(result.answered, 1);
  assert.equal(result.percentage, 50);
  assert.equal(scoreQuiz(questions, { q1: -1, q2: 10 }).answered, 0);
  assert.equal(scoreQuiz([], {}).percentage, 0);
});
test("quiz rejects invalid correct options and duplicate IDs", () => {
  assert.throws(() =>
    scoreQuiz([{ id: "q", options: [], correctOption: 0 }], {}),
  );
  assert.throws(() => scoreQuiz([questions[0], questions[0]], {}));
});
test("catalog searches both languages, case and full-width normalized strings", () => {
  const entries = [
    {
      id: "g1",
      name: { zh: "宇树 G1", en: "Unitree G1" },
      manufacturer: "Unitree",
      form: "humanoid",
    },
  ];
  assert.equal(filterCatalog(entries, { query: "Ｇ１" }).length, 1);
  assert.equal(filterCatalog(entries, { query: "宇树" }).length, 1);
  assert.equal(
    filterCatalog(entries, { query: "unitree", form: "quadruped" }).length,
    0,
  );
  assert.equal(filterCatalog(entries, { form: "all" }).length, 1);
});
test("progress survives valid roundtrip and is scoped by configuration/version", () => {
  const progress = emptyProgress("g1/base", "1");
  progress.completedLessons = ["lesson"];
  progress.answers = { q1: 1 };
  const raw = JSON.stringify(progress);
  assert.deepEqual(restoreProgress(raw, "g1/base", "1").completedLessons, [
    "lesson",
  ]);
  assert.deepEqual(restoreProgress(raw, "g1/base", "2").completedLessons, []);
  assert.deepEqual(restoreProgress(raw, "other", "1").completedLessons, []);
  assert.notEqual(progressKey("a:b", "c"), progressKey("a", "b:c"));
});
test("progress handles malformed, huge, malicious or incompatible data", () => {
  for (const raw of [
    null,
    "{broken",
    "null",
    "[]",
    '"x"',
    "x".repeat(1_000_001),
  ])
    assert.deepEqual(restoreProgress(raw, "g1", "1").answers, {});
  const progress = emptyProgress("g1", "1");
  assert.deepEqual(
    restoreProgress(
      JSON.stringify({ ...progress, completedSteps: ["a", "a"] }),
      "g1",
      "1",
    ).completedSteps,
    [],
  );
  const malicious = JSON.stringify(progress).replace(
    '"answers":{}',
    '"answers":{"__proto__":0}',
  );
  assert.deepEqual(restoreProgress(malicious, "g1", "1").answers, {});
});
test("storage quota and denied access are safe and observable", () => {
  const storage = {
    getItem() {
      throw Error("denied");
    },
    setItem() {
      throw Error("quota");
    },
    removeItem() {
      throw Error("denied");
    },
  };
  assert.equal(loadProgress(storage, "g1", "1").robotId, "g1");
  assert.equal(saveProgress(storage, emptyProgress("g1", "1")), false);
  assert.equal(clearProgress(storage, "g1", "1"), false);
});
test("storage saves and clears only scoped progress", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
  const progress = emptyProgress("g1", "1");
  progress.completedLessons = ["one"];
  assert.equal(saveProgress(storage, progress), true);
  assert.deepEqual(loadProgress(storage, "g1", "1").completedLessons, ["one"]);
  assert.equal(clearProgress(storage, "g1", "1"), true);
  assert.equal(values.size, 0);
});
test("publishing requires bilingual content, source, license and local assets", () => {
  const text = { zh: "中文", en: "English" };
  const robot = {
    id: "g1",
    status: "published" as const,
    name: text,
    description: text,
    sourceUrl: "https://example.com/source",
    urdfUrl: "/robots/g1/model.urdf",
    license: "BSD-3-Clause",
    verifiedScope: text,
    limitations: text,
  };
  assert.deepEqual(
    validateCatalog([robot], () => true),
    [],
  );
  assert.ok(
    validateCatalog([{ ...robot, name: { zh: "", en: "English" } }], () => true)
      .length,
  );
  assert.ok(validateCatalog([robot], () => false).length);
  assert.ok(
    validateCatalog(
      [{ ...robot, sourceUrl: "javascript:alert(1)" }],
      () => true,
    ).length,
  );
  assert.ok(
    validateCatalog([{ ...robot, urdfUrl: "/robots/../secret" }], () => true)
      .length,
  );
  assert.deepEqual(
    validateCatalog(
      [{ ...robot, status: "draft", sourceUrl: undefined }],
      () => false,
    ),
    [],
  );
});
