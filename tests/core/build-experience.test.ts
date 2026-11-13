import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialBuild,
  chooseBuildPart,
  holdBuildMarker,
  tickBuild,
  undoBuild,
  topologicalVisualLinks,
} from "../../src/core/buildExperience";
test("model assembly rejects wrong parts and requires two held virtual confirmations", () => {
  let s = initialBuild();
  s = chooseBuildPart(s, 1, 3);
  assert.equal(s.errors, 1);
  assert.equal(s.phase, "pick");
  s = chooseBuildPart(s, 0, 3);
  for (let i = 0; i < 20; i++) s = tickBuild(s, 0.05, 3);
  assert.equal(s.phase, "confirm");
  for (let i = 0; i < 20; i++) s = tickBuild(s, 0.05, 3);
  assert.equal(s.step, 0);
  s = holdBuildMarker(s, 1, true);
  assert.equal(s.held, false);
  s = holdBuildMarker(s, 0, true);
  s = tickBuild(s, 0.1, 3);
  s = holdBuildMarker(s, 0, false);
  assert.equal(s.confirmation, 0);
  s = holdBuildMarker(s, 0, true);
  for (let i = 0; i < 15; i++) s = tickBuild(s, 0.05, 3);
  assert.equal(s.marker, 1);
  assert.equal(s.step, 0);
  s = holdBuildMarker(s, 1, true);
  for (let i = 0; i < 15; i++) s = tickBuild(s, 0.05, 3);
  assert.equal(s.step, 1);
  assert.equal(s.phase, "pick");
});
test("automatic assembly completes every source group and pause does not advance time", () => {
  let s = { ...initialBuild(), auto: true };
  s = tickBuild(s, 0.05, 26);
  s = { ...s, paused: true };
  assert.deepEqual(tickBuild(s, 0.1, 26), s);
  s = { ...s, paused: false };
  for (let i = 0; i < 2000; i++) s = tickBuild(s, 0.05, 26);
  assert.equal(s.step, 26);
  assert.equal(s.phase, "complete");
  assert.equal(s.auto, false);
  assert.ok(s.elapsed > 50);
  assert.equal(undoBuild(s).step, 25);
  assert.equal(undoBuild(s).phase, "pick");
});
test("visual topology includes each available mesh link exactly once without inventing empty frames", () => {
  assert.deepEqual(
    topologicalVisualLinks(
      ["base", "sensor", "arm", "hand"],
      [
        { parent: "base", child: "sensor" },
        { parent: "base", child: "arm" },
        { parent: "arm", child: "hand" },
      ],
      new Set(["base", "arm", "hand"]),
    ),
    ["base", "arm", "hand"],
  );
  assert.throws(() =>
    topologicalVisualLinks(
      ["a", "b"],
      [
        { parent: "a", child: "b" },
        { parent: "b", child: "a" },
      ],
      new Set(["a"]),
    ),
  );
});
test("invalid time and empty model cannot advance the assembly", () => {
  const s = initialBuild();
  assert.deepEqual(tickBuild(s, NaN, 26), s);
  assert.deepEqual(tickBuild(s, 1, 0), s);
  assert.deepEqual(chooseBuildPart(s, 0, 0), s);
});
