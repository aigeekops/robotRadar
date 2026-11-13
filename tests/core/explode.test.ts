import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { applyExplode } from "../../src/core/explode";
test("explosion preserves world outward direction under rotated scaled parents and resets without drift", () => {
  const root = new T.Group();
  root.rotation.x = -Math.PI / 2;
  const link = new T.Group();
  (link as any).isURDFLink = true;
  link.rotation.z = 0.7;
  link.scale.set(2, 1, 0.5);
  root.add(link);
  const mesh = new T.Mesh(new T.BoxGeometry(0.2, 0.2, 0.2));
  mesh.position.set(1, 2, 3);
  link.add(mesh);
  root.updateMatrixWorld(true);
  const original = mesh.position.clone(),
    world = mesh.getWorldPosition(new T.Vector3());
  const map = new Map([[mesh, original]]);
  const expected = world
    .clone()
    .add(world.clone().normalize().multiplyScalar(0.5));
  for (let i = 0; i < 10; i++) {
    applyExplode(root, map, new T.Vector3(), 0.5);
    assert.ok(
      mesh.getWorldPosition(new T.Vector3()).distanceTo(expected) < 1e-9,
    );
  }
  applyExplode(root, map, new T.Vector3(), 0);
  assert.ok(mesh.position.distanceTo(original) < 1e-9);
});
test("nested visual meshes are not displaced twice", () => {
  const root = new T.Group();
  const a = new T.Mesh(new T.BoxGeometry());
  a.position.x = 2;
  const b = new T.Mesh(new T.BoxGeometry());
  b.position.x = 1;
  a.add(b);
  root.add(a);
  root.updateMatrixWorld(true);
  const before = b.getWorldPosition(new T.Vector3());
  applyExplode(
    root,
    new Map([
      [a, a.position.clone()],
      [b, b.position.clone()],
    ]),
    new T.Vector3(),
    0.4,
  );
  assert.ok(
    Math.abs(b.getWorldPosition(new T.Vector3()).distanceTo(before) - 0.4) <
      1e-9,
  );
});
test("source-named humanoid branches separate left/right and staged leg segments without changing rotations", () => {
  const root = new T.Group();
  root.rotation.x = -Math.PI / 2;
  const names = [
    "pelvis",
    "left_shoulder_pitch_link",
    "right_shoulder_pitch_link",
    "left_knee_link",
    "left_ankle_roll_link",
  ];
  const map = new Map<T.Object3D, T.Vector3>();
  const meshes = names.map((name) => {
    const link = new T.Group();
    link.name = name;
    (link as any).isURDFLink = true;
    root.add(link);
    const mesh = new T.Mesh(new T.BoxGeometry(0.1, 0.1, 0.1));
    link.add(mesh);
    map.set(mesh, mesh.position.clone());
    return mesh;
  });
  applyExplode(root, map, new T.Vector3(), 1);
  const pts = meshes.map((m) => m.getWorldPosition(new T.Vector3()));
  assert.ok(pts[1].z < 0 && pts[2].z > 0);
  assert.ok(pts[4].y < pts[3].y);
  meshes.forEach((m) =>
    assert.deepEqual(m.rotation.toArray(), [0, 0, 0, "XYZ"]),
  );
  applyExplode(root, map, new T.Vector3(), 0);
  meshes.forEach((m) => assert.equal(m.position.length(), 0));
});
