import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BoxGeometry,
  LoadingManager,
  Mesh,
  MeshBasicMaterial,
  Texture,
} from "three";
import { createMeshCache } from "../../src/viewer/meshCache";
import type { UrdfMeshLoader } from "../../src/viewer/urdfMeshLoader";
const load = (
  loader: UrdfMeshLoader,
  path = "/a.stl",
  manager = new LoadingManager(),
) =>
  new Promise<Mesh>((resolve, reject) =>
    loader(path, manager, (object, error) =>
      error ? reject(error) : resolve(object as Mesh),
    ),
  );

test("deduplicates concurrent parses and isolates disposable consumer resources", async () => {
  const cache = createMeshCache();
  let calls = 0;
  const texture = new Texture();
  const source = new Mesh(
    new BoxGeometry(),
    new MeshBasicMaterial({ map: texture }),
  );
  const loader = cache.wrap((p, m, done) => {
    calls++;
    setTimeout(() => done(source), 1);
  });
  const [a, b] = await Promise.all([load(loader), load(loader)]);
  assert.equal(calls, 1);
  assert.notEqual(a, b);
  assert.notEqual(a.geometry, b.geometry);
  assert.notEqual(a.material, b.material);
  assert.notEqual(
    (a.material as MeshBasicMaterial).map,
    (b.material as MeshBasicMaterial).map,
  );
  a.position.x = 10;
  a.geometry.attributes.position.array[0] = 999;
  a.geometry.dispose();
  (a.material as MeshBasicMaterial).map!.dispose();
  const c = await load(loader);
  assert.equal(calls, 1);
  assert.equal(c.position.x, 0);
  assert.notEqual(c.geometry.attributes.position.array[0], 999);
  assert.equal(cache.stats().hits, 2);
  cache.clear();
  assert.equal(cache.stats().bytes, 0);
});
test("errors are not retained; manager progress completes and retry succeeds", async () => {
  const cache = createMeshCache();
  let calls = 0,
    finished = 0;
  const manager = new LoadingManager(() => finished++);
  const loader = cache.wrap((p, m, done) => {
    if (++calls === 1) done(new Mesh(), new Error("network"));
    else done(new Mesh(new BoxGeometry(), new MeshBasicMaterial()));
  });
  await assert.rejects(load(loader, "/a.stl", manager), /network/);
  await load(loader, "/a.stl", manager);
  assert.equal(calls, 2);
  assert.equal(finished, 2);
  assert.equal(cache.stats().pending, 0);
});
test("resolved URLs do not collide across Pages bases; cache is bounded", async () => {
  const cache = createMeshCache(100000, 1);
  let calls = 0;
  const loader = cache.wrap((p, m, done) => {
    calls++;
    done(new Mesh(new BoxGeometry(), new MeshBasicMaterial()));
  });
  const a = new LoadingManager().setURLModifier((p) => "/a" + p),
    b = new LoadingManager().setURLModifier((p) => "/b" + p);
  await load(loader, "/same.stl", a);
  await load(loader, "/same.stl", b);
  assert.equal(calls, 2);
  assert.equal(cache.stats().entries, 1);
  await load(loader, "/same.stl", a);
  assert.equal(calls, 3);
  assert.ok(cache.stats().bytes <= 100000);
});
test("oversized templates are not retained", async () => {
  const cache = createMeshCache(1);
  const loader = cache.wrap((p, m, done) =>
    done(new Mesh(new BoxGeometry(), new MeshBasicMaterial())),
  );
  const object = await load(loader);
  assert.ok(object.geometry.attributes.position.count > 0);
  assert.equal(cache.stats().entries, 0);
});
