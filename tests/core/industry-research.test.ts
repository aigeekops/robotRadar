import test from "node:test";
import assert from "node:assert/strict";
import { industryResearch } from "../../src/robotResearch";
test("Optimus is research-only, not a pretend loadable model or SDK", () => {
  const card = industryResearch.find((c) => c.id === "tesla-optimus");
  assert.ok(card);
  assert.equal(card.kind, "research-only");
  assert.deepEqual(Object.values(card.capabilities), [
    false,
    false,
    false,
    false,
  ]);
  assert.ok(!("urdfUrl" in card));
  assert.ok(!("imageUrl" in card));
  assert.ok(!("sales" in card));
  assert.equal(card.checkedAt, "2026-11-13");
  assert.ok(card.unknowns.some((x) => x.en.includes("SDK")));
  assert.ok(
    card.facts
      .find((x) => x.id === "no-volume-inference")
      ?.text.en.includes("sales ranking"),
  );
});
test("every factual assertion links to identified primary-source evidence", () => {
  for (const card of industryResearch) {
    const ids = new Set(card.sources.map((s) => s.id));
    for (const f of card.facts) {
      assert.ok(f.sourceIds.length);
      for (const id of f.sourceIds) assert.ok(ids.has(id));
      assert.ok(f.text.zh && f.text.en);
    }
    for (const s of card.sources) {
      assert.match(
        new URL(s.url).hostname,
        card.manufacturer === "Tesla"
          ? /(^|\.)tesla\.com$/
          : /(^|\.)bostondynamics\.com$/,
      );
      assert.ok(s.locator);
      assert.ok(s.checkedAt);
    }
  }
});
test("Atlas electric research never substitutes a historical hydraulic model", () => {
  const card = industryResearch.find((c) => c.id === "atlas-electric-2026")!;
  assert.equal(card.kind, "research-only");
  assert.ok(Object.values(card.capabilities).every((v) => v === false));
  assert.ok(card.facts.some((f) => f.text.en.includes("hydraulic")));
  assert.ok(!("urdfUrl" in card));
});
