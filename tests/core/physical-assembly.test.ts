import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  ASSEMBLY_GUIDE_COMMIT,
  PHYSICAL_READING_KEY,
  answerPhysicalQuestion,
  emptyPhysicalProgress,
  markPhysicalRead,
  physicalAssemblyDisclaimer,
  physicalReadingModules,
  restorePhysicalProgress,
  understoodPhysicalModules,
} from "../../src/physicalAssembly.ts";
const guide = readFileSync(
  new URL(
    "../../assets-source/lerobot-guides/docs/source/so101.mdx",
    import.meta.url,
  ),
  "utf8",
);
const urdf = readFileSync(
  new URL("../../public/robots/so101/robot.urdf", import.meta.url),
  "utf8",
);
const linkIds = [...urdf.matchAll(/<link\s+name="([^"]+)"/g)].map(
  (match) => match[1],
);
const first = physicalReadingModules[0];

test("physical reading is nine modules with pinned source lines and known model IDs", () => {
  assert.equal(physicalReadingModules.length, 9);
  assert.equal(
    new Set(physicalReadingModules.map((entry) => entry.id)).size,
    9,
  );
  assert.equal(
    createHash("sha256").update(guide).digest("hex"),
    "b0b561065069a61792c88262a9544808aa676dc46a525b42a74c1dc543451beb",
  );
  const earlier = new Set<string>();
  for (const entry of physicalReadingModules) {
    const url = new URL(entry.sourceUrl);
    assert.equal(url.hostname, "github.com");
    assert.ok(url.pathname.includes(`/blob/${ASSEMBLY_GUIDE_COMMIT}/`));
    assert.equal(
      url.hash,
      `#L${entry.sourceLines[0]}-L${entry.sourceLines[1]}`,
    );
    assert.ok(
      entry.sourceLines[0] > 0 &&
        entry.sourceLines[1] <= guide.split("\n").length,
    );
    assert.ok(entry.sourceLines[1] >= entry.sourceLines[0]);
    for (const part of entry.partIds) assert.ok(linkIds.includes(part));
    for (const dependency of entry.prerequisites)
      assert.ok(earlier.has(dependency));
    earlier.add(entry.id);
    for (const extra of entry.additionalSourceUrls ?? [])
      assert.equal(new URL(extra).protocol, "https:");
  }
});

test("physical reading translations, choices, and non-hardware disclaimer are complete", () => {
  for (const entry of physicalReadingModules) {
    const translated = [
      entry.title,
      entry.body,
      entry.question.prompt,
      entry.question.explanation,
      ...entry.question.options,
      ...entry.fasteners,
      ...(entry.ambiguity ? [entry.ambiguity] : []),
    ];
    for (const value of translated)
      for (const language of ["zh", "en"] as const)
        assert.ok(value[language].trim());
    assert.ok(Number.isInteger(entry.question.answer));
    assert.ok(
      entry.question.answer >= 0 &&
        entry.question.answer < entry.question.options.length,
    );
  }
  assert.match(physicalAssemblyDisclaimer.en, /not physical assembly/);
  assert.match(physicalAssemblyDisclaimer.zh, /不代表已经装配实物/);
  assert.ok(PHYSICAL_READING_KEY.includes(ASSEMBLY_GUIDE_COMMIT));
});

test("both-sides fastener ambiguity remains explicit in wrist and jaw modules", () => {
  for (const index of [6, 7]) {
    const ambiguity = physicalReadingModules[index].ambiguity;
    assert.ok(ambiguity);
    assert.match(ambiguity.en, /both sides/);
  }
  assert.equal(
    physicalReadingModules.filter((entry) => entry.ambiguity).length,
    2,
  );
});

test("reading prerequisites and read-before-answer are enforced", () => {
  const initial = emptyPhysicalProgress();
  assert.throws(() => markPhysicalRead(initial, physicalReadingModules[1].id));
  assert.throws(() =>
    answerPhysicalQuestion(initial, first.id, first.question.answer),
  );
  assert.throws(() => markPhysicalRead(initial, "unknown"));
  const read = markPhysicalRead(initial, first.id);
  assert.deepEqual(understoodPhysicalModules(read), []);
  assert.throws(() => answerPhysicalQuestion(read, first.id, 999));
  assert.throws(() => answerPhysicalQuestion(read, first.id, NaN));
  assert.throws(() => answerPhysicalQuestion(read, "unknown", 0));
});

test("wrong answers do not unlock the next reading module", () => {
  let progress = markPhysicalRead(emptyPhysicalProgress(), first.id);
  progress = answerPhysicalQuestion(
    progress,
    first.id,
    (first.question.answer + 1) % 3,
  );
  assert.equal(understoodPhysicalModules(progress).length, 0);
  assert.throws(() => markPhysicalRead(progress, physicalReadingModules[1].id));
  progress = answerPhysicalQuestion(progress, first.id, first.question.answer);
  assert.deepEqual(understoodPhysicalModules(progress), [first.id]);
  assert.ok(
    markPhysicalRead(progress, physicalReadingModules[1].id).read.includes(
      physicalReadingModules[1].id,
    ),
  );
});

function completedProgress() {
  let progress = emptyPhysicalProgress();
  for (const entry of physicalReadingModules) {
    progress = markPhysicalRead(progress, entry.id);
    progress = answerPhysicalQuestion(
      progress,
      entry.id,
      entry.question.answer,
    );
  }
  return progress;
}

test("all nine modules complete only learning and survive a valid restore", () => {
  const progress = completedProgress();
  assert.equal(progress.read.length, 9);
  assert.equal(understoodPhysicalModules(progress).length, 9);
  assert.deepEqual(restorePhysicalProgress(JSON.stringify(progress)), progress);
  assert.deepEqual(Object.keys(progress).sort(), [
    "answers",
    "read",
    "version",
  ]);
});

test("changing an upstream answer invalidates downstream learning claims", () => {
  const complete = completedProgress();
  const changed = answerPhysicalQuestion(
    complete,
    first.id,
    (first.question.answer + 1) % 3,
  );
  assert.deepEqual(changed.read, [first.id]);
  assert.equal(understoodPhysicalModules(changed).length, 0);
  assert.equal(complete.read.length, 9);
});

test("malformed, oversized, incompatible and forged progress is safely bounded", () => {
  for (const raw of [
    null,
    "{",
    "[]",
    "null",
    "x".repeat(17000),
    JSON.stringify({ version: 2, read: [first.id], answers: {} }),
  ])
    assert.deepEqual(restorePhysicalProgress(raw), emptyPhysicalProgress());
  const forged = restorePhysicalProgress(
    JSON.stringify({
      version: 1,
      read: ["unknown", "so101-a8", first.id, first.id],
      answers: { "so101-a8": 2, [first.id]: 99 },
      physicallyAssembled: true,
    }),
  );
  assert.deepEqual(forged, { version: 1, read: [first.id], answers: {} });
  assert.ok(!("physicallyAssembled" in forged));
});
