import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_NAVIGATION,
  PAGES,
  MODES,
  VIEWS,
  parseNavigation,
  serializeNavigation,
  patchNavigation,
  navigationHref,
  writeNavigation,
  type NavigationState,
} from "../../src/core/navigation.ts";
const selected: NavigationState = {
  robot: "g1-mode10",
  lang: "en",
  page: "lab",
  mode: "joints",
  part: "left_elbow_link",
  lesson: "基础 关节",
  view: "iso",
};
test("navigation roundtrips all fields using safe query encoding", () => {
  const query = serializeNavigation(selected);
  assert.ok(query.startsWith("?robot="));
  assert.ok(query.includes("%E5%9F%BA"));
  assert.deepEqual(parseNavigation(query), selected);
  assert.deepEqual(parseNavigation(new URLSearchParams(query)), selected);
  assert.deepEqual(
    parseNavigation(new URL(`https://example.com/lab${query}`)),
    selected,
  );
});
test("navigation null, missing and unknown enum values fall back predictably", () => {
  assert.deepEqual(parseNavigation(null), DEFAULT_NAVIGATION);
  assert.deepEqual(parseNavigation(undefined), DEFAULT_NAVIGATION);
  assert.deepEqual(parseNavigation(""), DEFAULT_NAVIGATION);
  assert.deepEqual(
    parseNavigation("?lang=xx&page=else&mode=unsafe&view=unknown"),
    DEFAULT_NAVIGATION,
  );
  assert.equal(
    parseNavigation("?lang=xx", { fallback: { lang: "en" } }).lang,
    "en",
  );
});
test("all documented page, mode and view values are supported", () => {
  for (const page of PAGES)
    assert.equal(parseNavigation(`?page=${page}`).page, page);
  for (const mode of MODES)
    assert.equal(parseNavigation(`?mode=${mode}`).mode, mode);
  for (const view of VIEWS)
    assert.equal(parseNavigation(`?view=${view}`).view, view);
});
test("navigation rejects unknown IDs with contextual allowlists", () => {
  const options = { robotIds: ["g1"], partIds: ["pelvis"], lessonIds: ["one"] };
  assert.deepEqual(
    parseNavigation("?robot=go2&part=other&lesson=missing", options),
    DEFAULT_NAVIGATION,
  );
  assert.equal(
    parseNavigation("?robot=g1&part=pelvis&lesson=one", options).part,
    "pelvis",
  );
  assert.equal(
    parseNavigation("", { robotIds: ["g1"], fallback: { robot: "g1" } }).robot,
    "g1",
  );
  assert.equal(
    parseNavigation("?robot=unknown", {
      robotIds: ["g1"],
      fallback: { robot: "g1" },
    }).robot,
    null,
  );
});
test("explicit empty IDs clear fallback, including canonical null roundtrip", () => {
  const options = { fallback: { robot: "g1", part: "pelvis", lesson: "one" } };
  const cleared = parseNavigation("?robot=&part=&lesson=", options);
  assert.equal(cleared.robot, null);
  assert.equal(cleared.part, null);
  assert.equal(cleared.lesson, null);
  assert.deepEqual(
    parseNavigation(serializeNavigation({ ...DEFAULT_NAVIGATION }), options),
    DEFAULT_NAVIGATION,
  );
});
test("duplicate keys are rejected independent of order", () => {
  for (const query of ["?robot=g1&robot=go2", "?robot=go2&robot=g1"])
    assert.equal(parseNavigation(query).robot, null);
  assert.equal(parseNavigation("?page=compare&page=lab").page, "lab");
  assert.equal(
    parseNavigation("?lang=zh&lang=en", { fallback: { lang: "en" } }).lang,
    "en",
  );
});
test("navigation refuses URL-like, path-like and control-character identifiers", () => {
  for (const id of [
    "https://evil.test",
    "//evil.test",
    "../file",
    "a\\b",
    "javascript:alert(1)",
    "<script>",
    "a\n",
    "a\u0000",
    " a",
    "a".repeat(129),
  ]) {
    assert.equal(
      parseNavigation(`?robot=${encodeURIComponent(id)}`).robot,
      null,
    );
  }
  assert.equal(parseNavigation("?robot=%E0%A4%A").robot, null);
});
test("unknown query fields never propagate into canonical navigation", () => {
  const state = parseNavigation(
    "?robot=g1&redirect=https%3A%2F%2Fevil.test&__proto__=x",
  );
  assert.equal(state.robot, "g1");
  assert.ok(!serializeNavigation(state).includes("redirect"));
  assert.ok(!serializeNavigation(state).includes("evil"));
});
test("oversized or non-query strings safely return defaults", () => {
  for (const value of [
    "x".repeat(8193),
    "https://evil.test/?robot=g1",
    "//evil.test/?robot=g1",
    "?robot=g1#evil",
  ])
    assert.deepEqual(parseNavigation(value), DEFAULT_NAVIGATION);
});
test("patches preserve independent state and never mutate input", () => {
  const next = patchNavigation(selected, { lang: "zh", mode: "learn" });
  assert.equal(next.robot, selected.robot);
  assert.equal(next.part, selected.part);
  assert.equal(next.lang, "zh");
  assert.equal(selected.lang, "en");
  assert.equal(
    patchNavigation(selected, { robot: "missing" }, { robotIds: ["g1"] }).robot,
    null,
  );
});
test("same-site href rejects external and ambiguous navigation paths", () => {
  assert.equal(
    navigationHref("/lab", selected),
    `/lab${serializeNavigation(selected)}`,
  );
  for (const path of [
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "/%2fevil",
    "/x?redirect=evil",
    "/x#hash",
    "/x\n",
  ])
    assert.throws(() => navigationHref(path, selected));
});
test("history writer supports push and replace without navigating external URLs", () => {
  const calls: { kind: string; data: unknown; url: unknown }[] = [];
  const history = {
    pushState(data: unknown, _unused: string, url?: string | URL | null) {
      calls.push({ kind: "push", data, url });
    },
    replaceState(data: unknown, _unused: string, url?: string | URL | null) {
      calls.push({ kind: "replace", data, url });
    },
  };
  const pushed = writeNavigation(history, "/", selected);
  const replaced = writeNavigation(
    history,
    "/lab",
    { ...selected, view: "top" },
    "replace",
  );
  assert.equal(calls[0].kind, "push");
  assert.equal(calls[1].kind, "replace");
  assert.equal(calls[0].url, pushed);
  assert.equal(calls[1].url, replaced);
  assert.equal(
    (calls[0].data as { navigation: NavigationState }).navigation.robot,
    selected.robot,
  );
});
