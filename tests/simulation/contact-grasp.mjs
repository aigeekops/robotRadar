import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const root = process.cwd(),
  stage = process.env.CONTACT_GRASP_STAGE || root;
const { default: init } = await import(
  pathToFileURL(path.join(root, "public/vendor/mujoco/mujoco.js")).href
);
const { createGraspSimulation } = await import(
  pathToFileURL(path.join(stage, "public/vendor/mujoco/leap-grasp/runtime.js"))
    .href
);
const e = await init();
e.FS.mkdir("/leap");
for (const f of fs.readdirSync(path.join(root, "public/robots/leap_hand")))
  if (f.endsWith(".stl"))
    e.FS.writeFile(
      "/leap/" + f,
      fs.readFileSync(path.join(root, "public/robots/leap_hand", f)),
    );
const source = fs.readFileSync(
  path.join(stage, "public/vendor/mujoco/leap-grasp/model.xml"),
  "utf8",
);
function create(variant = "normal", dt = 0.001) {
  let xml = source;
  if (variant === "no-collision")
    xml = xml.replace(
      'name="object_geom"',
      'name="object_geom" contype="0" conaffinity="0"',
    );
  if (variant === "no-support")
    xml = xml.replace(
      /name="(table|seat[0-3])"/g,
      'name="$1" contype="0" conaffinity="0"',
    );
  e.FS.writeFile("/leap/test.xml", xml);
  const model = e.MjModel.mj_loadXML("/leap/test.xml");
  return { model, sim: createGraspSimulation(e, model, { timestep: dt }) };
}
function run(sim, dt, delay = 0, allowGrasp = true) {
  let state = sim.snapshot(),
    g = false,
    l = false,
    p = false,
    maxPen = 0,
    stationary = 0;
  for (let i = 0; i < Math.ceil(22 / (dt * 20)); i++) {
    if (allowGrasp && !g && state.time >= 0.5 + delay) {
      sim.command("grasp");
      g = true;
    }
    if (
      !l &&
      state.phase === "grasped" &&
      state.hasGrasp &&
      state.time >= 3 + delay
    ) {
      sim.command("lift");
      l = true;
    }
    if (
      !p &&
      state.phase === "holding" &&
      state.earnedHold &&
      state.time >= 7 + delay
    ) {
      sim.command("place");
      p = true;
    }
    state = sim.step(20);
    maxPen = Math.max(maxPen, ...state.contacts.map((c) => -c.distance));
    stationary = Math.max(stationary, state.holdSeconds);
    if (["complete", "failed"].includes(state.phase)) break;
  }
  return { state, maxPen, stationary };
}
for (const dt of [0.001, 0.0005])
  test(`actual source envelope grasp completes at dt=${dt}`, () => {
    const { model, sim } = create("normal", dt);
    try {
      assert.equal(sim.snapshot().contacts.length, 0);
      assert.throws(() => sim.command("place"));
      assert.throws(() => sim.command("lift"));
      const r = run(sim, dt);
      assert.equal(r.state.phase, "complete");
      assert.ok(r.stationary >= 1);
      assert.ok(r.state.placeSeconds >= 1);
      assert.ok(r.maxPen < 0.0011);
      assert.ok(r.state.contacts.every((c) => c.body === "world"));
      assert.ok(r.state.speed < 0.01);
      const support = r.state.contacts.reduce((s, c) => s + c.normal, 0);
      assert.ok(Math.abs(support - 0.025 * 9.81) < 0.001);
      assert.ok(
        Math.hypot(r.state.position[0] + 0.045, r.state.position[1] + 0.035) <
          0.005,
      );
    } finally {
      sim.dispose();
      model.delete();
    }
  });
test("manual action timing may be delayed without substituting replay", () => {
  const { model, sim } = create();
  try {
    assert.equal(run(sim, 0.001, 1).state.phase, "complete");
  } finally {
    sim.dispose();
    model.delete();
  }
});
for (const variant of ["open", "no-collision", "no-support"])
  test(`${variant} cannot earn grasp-task success`, () => {
    const { model, sim } = create(variant);
    try {
      const r = run(sim, 0.001, 0, variant !== "open");
      assert.notEqual(r.state.phase, "complete");
      assert.equal(r.state.earnedHold, false);
      assert.equal(r.stationary, 0);
      if (variant === "open") {
        assert.equal(r.state.phase, "ready");
        assert.throws(() => sim.command("place"));
      }
    } finally {
      sim.dispose();
      model.delete();
    }
  });
test("runtime model contains no attachment equality and no actuator shortcut", () => {
  assert.ok(!/<equality|<weld|<connect/.test(source));
  const { model, sim } = create();
  try {
    assert.equal(model.neq, 0);
    assert.equal(model.nu, 0);
    assert.equal(model.nq, 24);
    assert.throws(() => sim.step(1000));
    sim.dispose();
    assert.throws(() => sim.command("grasp"));
  } finally {
    sim.dispose();
    model.delete();
  }
});

test("earliest enabled manual actions still complete", () => {
  const { model, sim } = create();
  try {
    let s = sim.snapshot(),
      g = false,
      l = false,
      p = false;
    for (let k = 0; k < 1500; k++) {
      if (!g && s.time >= 0.4) {
        sim.command("grasp");
        g = true;
      }
      if (!l && s.phase === "grasped" && s.hasGrasp) {
        sim.command("lift");
        l = true;
      }
      if (!p && s.phase === "holding" && s.earnedHold) {
        sim.command("place");
        p = true;
      }
      s = sim.step(20);
      if (["complete", "failed"].includes(s.phase)) break;
    }
    assert.equal(s.phase, "complete");
  } finally {
    sim.dispose();
    model.delete();
  }
});
