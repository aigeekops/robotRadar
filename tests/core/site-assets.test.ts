import test from "node:test";
import assert from "node:assert/strict";
import { resolveSiteAsset } from "../../src/core/siteAssets";
test("static assets work at domain root and GitHub Pages project subpath", () => {
  assert.equal(
    resolveSiteAsset("/robots/g1/robot.urdf", "https://owner.github.io/"),
    "/robots/g1/robot.urdf",
  );
  assert.equal(
    resolveSiteAsset(
      "/robots/g1/robot.urdf",
      "https://owner.github.io/robot-radar/",
    ),
    "/robot-radar/robots/g1/robot.urdf",
  );
  assert.equal(
    resolveSiteAsset(
      "https://owner.github.io/robots/g1/meshes/a.STL",
      "https://owner.github.io/robot-radar/",
    ),
    "/robot-radar/robots/g1/meshes/a.STL",
  );
  assert.equal(
    resolveSiteAsset(
      "/previews/g1.png",
      "https://owner.github.io/robot-radar/",
    ),
    "/robot-radar/previews/g1.png",
  );
});
test("resolved paths are idempotent and external evidence links are untouched", () => {
  const base = "https://owner.github.io/robot-radar/";
  const once = resolveSiteAsset("/robots/g1/robot.urdf", base);
  assert.equal(resolveSiteAsset(once, base), once);
  assert.equal(
    resolveSiteAsset("https://github.com/vendor/source", base),
    "https://github.com/vendor/source",
  );
  assert.equal(
    resolveSiteAsset("blob:https://owner.github.io/123", base),
    "blob:https://owner.github.io/123",
  );
});
