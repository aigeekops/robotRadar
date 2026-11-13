import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  LoadingManager,
  Mesh,
  Object3D,
  MeshPhongMaterial,
  Group,
} from "three";
import {
  parseUrdfObj,
  withObjMeshSupport,
} from "../../src/viewer/urdfMeshLoader";
import { resolveSiteAsset } from "../../src/core/siteAssets";
const triangle = "o part\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n";
test("single OBJ mesh permits upstream URDF visual colour without geometry change", () => {
  const result = parseUrdfObj(triangle);
  assert.ok(result instanceof Mesh);
  assert.equal(result.geometry.getAttribute("position").count, 3);
  // Same material assignment performed by urdf-loader for a returned THREE.Mesh.
  const yellow = new MeshPhongMaterial({ color: 0xffd700 });
  result.material = yellow;
  assert.equal(result.material.color.getHex(), 0xffd700);
});
test("vertex colours and grouped geometry retain source structure", () => {
  const result = parseUrdfObj(
    "v 0 0 0 1 0 0\nv 1 0 0 0 1 0\nv 0 1 0 0 0 1\nf 1 2 3",
  );
  assert.ok(result instanceof Group);
  const mesh = result.children[0] as Mesh;
  assert.ok(mesh.geometry.getAttribute("color"));
  const multi = parseUrdfObj(triangle + "o second\nf 1 3 2");
  assert.equal(multi.children.length, 2);
});
test("external materials, empty and non-finite geometry fail explicitly", () => {
  for (const text of [
    "mtllib body.mtl\n" + triangle,
    "usemtl gold\n" + triangle,
    "# empty",
    "v NaN 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3",
  ])
    assert.throws(() => parseUrdfObj(text));
});
test("STL/DAE delegate unchanged and OBJ uses the same static-path manager", () => {
  const manager = new LoadingManager();
  manager.setURLModifier((p) =>
    resolveSiteAsset(p, "https://test.invalid/robot-radar/"),
  );
  let delegated = 0;
  let readPath = "";
  const adapter = withObjMeshSupport(
    (path, m, done) => {
      delegated++;
      assert.equal(m, manager);
      done(new Object3D());
    },
    (path, m, success) => {
      readPath = m.resolveURL(path);
      success(triangle);
    },
  );
  let completed = 0;
  for (const path of [
    "/robots/a/a.stl",
    "/robots/a/a.dae",
    "/robots/spot/body.OBJ?rev=1#mesh",
  ])
    adapter(path, manager, (_, err) => {
      assert.ifError(err);
      completed++;
    });
  assert.equal(delegated, 2);
  assert.equal(completed, 3);
  assert.equal(readPath, "/robot-radar/robots/spot/body.OBJ?rev=1#mesh");
});
test("completion is once on read failure, malformed data, sync throw and unknown extension", () => {
  const manager = new LoadingManager();
  let calls = 0;
  const adapter = withObjMeshSupport(
    () => {
      throw Error("sync fallback");
    },
    (_, __, success, fail) => {
      fail("network");
      success(triangle);
      fail("again");
    },
  );
  for (const path of ["a.obj", "a.stl", "a.glb"])
    adapter(path, manager, (_, err) => {
      calls++;
      assert.ok(err);
    });
  assert.equal(calls, 3);
  let parseError = false;
  withObjMeshSupport(
    () => {},
    (_, __, success) => success("# empty"),
  )("a.obj", manager, (_, err) => {
    parseError = !!err;
  });
  assert.ok(parseError);
});
test("all staged Spot visuals parse without missing MTL and retain finite source vertices", () => {
  const dir = new URL(
    "../../assets-source/staged/spot/package/meshes/base_simple/visual/",
    import.meta.url,
  );
  const files = readdirSync(dir).filter((f) => f.endsWith(".obj"));
  assert.equal(files.length, 13);
  for (const f of files) {
    const text = readFileSync(new URL(f, dir), "utf8");
    const mesh = parseUrdfObj(text);
    assert.ok(mesh instanceof Mesh, f);
    assert.ok(mesh.geometry.getAttribute("position").count > 0, f);
  }
});

test("DAE authoring lights are removed without changing mesh/material/transforms or callback semantics", async () => {
  const { PointLight, BoxGeometry } = await import("three");
  const { removeImportedAssetLights } =
    await import("../../src/viewer/urdfMeshLoader");
  const group = new Group();
  const geometry = new BoxGeometry();
  const material = new MeshPhongMaterial({ color: 0xabcdef });
  const mesh = new Mesh(geometry, material);
  mesh.position.set(1, 2, 3);
  const light = new PointLight(0xffffff, 1000);
  group.add(mesh, light);
  const result = removeImportedAssetLights(group);
  assert.equal(result, group);
  assert.equal(light.parent, null);
  assert.equal(mesh.geometry, geometry);
  assert.equal(mesh.material, material);
  assert.deepEqual(mesh.position.toArray(), [1, 2, 3]);
  group.add(light);
  let calls = 0;
  withObjMeshSupport((_, __, done) => done(group))(
    "wheel.dae",
    new LoadingManager(),
    (obj, err) => {
      calls++;
      assert.ifError(err);
      assert.equal(obj, group);
      assert.equal(light.parent, null);
    },
  );
  assert.equal(calls, 1);
});
