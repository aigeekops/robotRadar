import test from "node:test";
import assert from "node:assert/strict";
import { assemblyTrayLayout } from "../../src/core/assemblyTrayLayout";
for (const count of [0, 1, 4, 17, 26, 48])
  test(`${count} actual steps all receive distinct nonoverlapping overview trays`, () => {
    const footprints = Array.from({ length: count }, (_, i) => ({
      width: 0.1 + (i % 5) * 0.2,
      depth: 0.1 + (i % 7) * 0.1,
    }));
    const a = assemblyTrayLayout(footprints, 1.3);
    assert.equal(a.cells.length, count);
    assert.deepEqual(
      a.cells.map((c) => c.index),
      Array.from({ length: count }, (_, i) => i),
    );
    for (let i = 0; i < count; i++)
      for (let j = i + 1; j < count; j++) {
        const x = Math.abs(a.cells[i].x - a.cells[j].x),
          z = Math.abs(a.cells[i].z - a.cells[j].z);
        assert.ok(
          x > (footprints[i].width + footprints[j].width) / 2 ||
            z > (footprints[i].depth + footprints[j].depth) / 2,
        );
      }
    assert.deepEqual(assemblyTrayLayout(footprints, 1.3), a);
  });
test("invalid source geometry never invents overview cells", () => {
  assert.throws(() => assemblyTrayLayout([{ width: NaN, depth: 1 }], 1));
  assert.throws(() => assemblyTrayLayout([], 0));
});
