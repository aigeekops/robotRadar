import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { photographicMaterial } from "../../src/viewer/realism";

test("photographic material retains source colour, maps, alpha and sidedness without mutating source", () => {
  const texture = new THREE.Texture();
  const source = new THREE.MeshPhongMaterial({
    color: 0x8194aa,
    map: texture,
    opacity: 0.6,
    transparent: true,
    side: THREE.DoubleSide,
    alphaTest: 0.2,
  });
  const original = source.color.clone();
  const result = photographicMaterial(source) as THREE.MeshStandardMaterial;
  assert.ok(result.isMeshStandardMaterial);
  assert.ok(result.color.equals(original));
  assert.ok(source.color.equals(original));
  assert.equal(result.map, texture);
  assert.equal(result.opacity, 0.6);
  assert.equal(result.transparent, true);
  assert.equal(result.side, THREE.DoubleSide);
  assert.equal(result.alphaTest, 0.2);
  result.emissive.set(0xff5500);
  assert.equal(source.emissive.getHex(), 0);
});

test("existing PBR roughness, metalness and maps are not replaced", () => {
  const source = new THREE.MeshStandardMaterial({
    color: 0x353535,
    roughness: 0.73,
    metalness: 0.51,
  });
  const result = photographicMaterial(source) as THREE.MeshStandardMaterial;
  assert.notEqual(result, source);
  assert.equal(result.roughness, 0.73);
  assert.equal(result.metalness, 0.51);
});

test("scene texture collection deduplicates shared maps and only disposes on teardown", async () => {
  const { collectMaterialTextures } = await import("../../src/viewer/realism");
  const texture = new THREE.Texture();
  let disposed = 0;
  texture.addEventListener("dispose", () => disposed++);
  const first = new THREE.MeshPhongMaterial({ map: texture, bumpMap: texture });
  const second = photographicMaterial(first);
  const owned = new Set<THREE.Texture>();
  collectMaterialTextures(first, owned);
  collectMaterialTextures(second, owned);
  assert.equal(owned.size, 1);
  assert.equal(disposed, 0);
  owned.forEach((value) => value.dispose());
  assert.equal(disposed, 1);
});
