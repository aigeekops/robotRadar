import test from "node:test";
import assert from "node:assert/strict";
import { Box3, Vector3, PerspectiveCamera } from "three";
import { fitAssemblyOverview } from "../../src/core/assemblyOverviewFit";
for (const aspect of [0.5, 1, 1.5, 2.5])
  test(`perspective overview ${aspect}: all corners inside 82% frame with a limiting edge at 82%`, () => {
    const b = new Box3(new Vector3(-3, 0, -4), new Vector3(3, 1.5, 4)),
      fit = fitAssemblyOverview(b, new Vector3(0.55, 1.65, 1.2), 40, aspect);
    const c = new PerspectiveCamera(40, aspect, 0.01, 100);
    c.position.copy(fit.position);
    c.lookAt(fit.center);
    c.updateMatrixWorld();
    let max = 0;
    for (const x of [-3, 3])
      for (const y of [0, 1.5])
        for (const z of [-4, 4]) {
          const p = new Vector3(x, y, z).project(c);
          assert.ok(Math.abs(p.x) <= 0.820001 && Math.abs(p.y) <= 0.820001);
          max = Math.max(max, Math.abs(p.x), Math.abs(p.y));
        }
    assert.ok(Math.abs(max - 0.82) < 1e-6);
  });
