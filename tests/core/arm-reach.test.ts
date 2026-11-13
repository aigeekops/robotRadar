import test from "node:test";
import assert from "node:assert/strict";
import {
  armEndpoints,
  reachPose,
  dwellProgress,
} from "../../src/core/armReach";
import { readFileSync } from "node:fs";
test("configured endpoints exist in each local source URDF", () => {
  for (const [id, link] of Object.entries(armEndpoints))
    assert.ok(
      readFileSync(`public/robots/${id}/robot.urdf`, "utf8").includes(
        `<link name="${link}"`,
      ),
    );
});
test("targets use finite in-limit joint poses", () => {
  const limits = [
    { name: "a", lower: -2, upper: -0.1 },
    { name: "b", lower: 0, upper: 3 },
  ];
  for (let stage = 0; stage < 3; stage++) {
    const pose = reachPose(limits, stage);
    for (const j of limits)
      assert.ok(pose[j.name] >= j.lower && pose[j.name] <= j.upper);
  }
});
test("continuous dwell resets outside tolerance and rejects timing gaps", () => {
  assert.equal(dwellProgress(0.03, 0.8, 0.1), 0);
  assert.equal(dwellProgress(NaN, 0.8, 0.1), 0);
  assert.equal(dwellProgress(0.01, 0, 10), 0.1);
  assert.equal(dwellProgress(0.01, 0.95, 0.1), 1);
});

import { execFileSync } from "node:child_process";
import * as THREE from "three";
test("four source chains: legal FK targets differ from initial endpoint", () => {
  for (const [id, endpoint] of Object.entries(armEndpoints)) {
    const joints = JSON.parse(
      execFileSync(
        "python3",
        [
          "-c",
          `import xml.etree.ElementTree as E,json,sys
r=E.parse(sys.argv[1]).getroot(); a=[]
for j in r.findall('joint'):
 o=j.find('origin'); l=j.find('limit'); x=j.find('axis')
 a.append(dict(name=j.get('name'),type=j.get('type'),parent=j.find('parent').get('link'),child=j.find('child').get('link'),xyz=[float(v) for v in (o.get('xyz','0 0 0') if o is not None else '0 0 0').split()],rpy=[float(v) for v in (o.get('rpy','0 0 0') if o is not None else '0 0 0').split()],axis=[float(v) for v in (x.get('xyz') if x is not None else '1 0 0').split()],lower=float(l.get('lower','0')) if l is not None else 0,upper=float(l.get('upper','0')) if l is not None else 0))
print(json.dumps(a))`,
          `public/robots/${id}/robot.urdf`,
        ],
        { encoding: "utf8" },
      ),
    ) as {
      name: string;
      type: string;
      parent: string;
      child: string;
      xyz: number[];
      rpy: number[];
      axis: number[];
      lower: number;
      upper: number;
    }[];
    const chain: typeof joints = [];
    let link = endpoint;
    for (let guard = 0; guard < 100; guard++) {
      const j = joints.find((j) => j.child === link);
      if (!j) break;
      chain.unshift(j);
      link = j.parent;
    }
    const limits = chain.filter((j) => j.type !== "fixed" && j.upper > j.lower);
    assert.ok(limits.length >= 5);
    const fk = (pose: Record<string, number>) => {
      const matrix = new THREE.Matrix4();
      for (const j of chain) {
        const q = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(j.rpy[0], j.rpy[1], j.rpy[2], "ZYX"),
        );
        matrix.multiply(
          new THREE.Matrix4().compose(
            new THREE.Vector3(...(j.xyz as [number, number, number])),
            q,
            new THREE.Vector3(1, 1, 1),
          ),
        );
        const axis = new THREE.Vector3(
          ...(j.axis as [number, number, number]),
        ).normalize();
        if (j.type === "revolute")
          matrix.multiply(
            new THREE.Matrix4().makeRotationAxis(axis, pose[j.name] || 0),
          );
        if (j.type === "prismatic")
          matrix.multiply(
            new THREE.Matrix4().makeTranslation(
              axis.multiplyScalar(pose[j.name] || 0),
            ),
          );
      }
      return new THREE.Vector3().setFromMatrixPosition(matrix);
    };
    const initial = Object.fromEntries(
      limits.map((j) => [j.name, Math.max(j.lower, Math.min(j.upper, 0))]),
    );
    const base = fk(initial);
    const distances = [0, 1, 2].map((stage) => {
      const pose = reachPose(limits, stage);
      for (const j of limits)
        assert.ok(pose[j.name] >= j.lower && pose[j.name] <= j.upper);
      const target = fk(pose);
      assert.ok(target.toArray().every(Number.isFinite));
      const distance = target.distanceTo(base);
      assert.ok(distance > 0.02, `${id} initial within tolerance`);
      return +(distance * 100).toFixed(2);
    });
    console.log(
      JSON.stringify({
        id,
        endpoint,
        joints: limits.length,
        initialTargetDistancesCm: distances,
      }),
    );
  }
});
