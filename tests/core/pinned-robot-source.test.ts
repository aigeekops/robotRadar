import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pinnedRobotSource } from "../../src/core/pinnedRobotSource";
const manifest = JSON.parse(
  readFileSync("public/robots/manifest.json", "utf8"),
);
for (const robot of manifest)
  test(`${robot.id}: evidence source matches exact local provenance repository, revision and source file`, () => {
    const provenance = JSON.parse(
      readFileSync(`public/robots/${robot.id}/provenance.json`, "utf8"),
    );
    const repo = new URL(provenance.repository);
    const segments = repo.pathname.split("/").filter(Boolean);
    assert.equal(robot.sourceCommit, provenance.commit);
    const expected = `https://github.com/${segments[0]}/${segments[1]}/blob/${provenance.commit}/${provenance.sourceFile}`;
    assert.equal(pinnedRobotSource(robot), expected);
    assert.equal(
      pinnedRobotSource({ ...robot, sourceCommit: "0".repeat(40) }),
      null,
    );
  });
test("unknown source IDs and unpinned revisions never fabricate a source link", () => {
  for (const id of ["unlisted", "__proto__", "constructor"])
    assert.equal(pinnedRobotSource({ id, sourceCommit: "a".repeat(40) }), null);
  assert.equal(pinnedRobotSource({ id: "g1" }), null);
});
