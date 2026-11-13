import initialize from "./mujoco.js";
let engine, model, profile, initializing;
async function setup(base) {
  if (model) return;
  if (initializing) return initializing;
  initializing = (async () => {
    engine = await initialize({
      locateFile: (p) => new URL(p, import.meta.url).href,
    });
    const get = async (p) => {
      const r = await fetch(new URL(p, base));
      if (!r.ok) throw Error(`Asset unavailable: ${p}`);
      return r;
    };
    let xml = await (await get("robots/g1/robot.urdf")).text();
    const paths = [
      ...new Set([...xml.matchAll(/filename="([^\"]+)"/g)].map((m) => m[1])),
    ];
    engine.FS.mkdir("/g1");
    engine.FS.mkdir("/g1/meshes");
    await Promise.all(
      paths.map(async (path) => {
        if (!/^\/robots\/g1\/meshes\/[^/]+$/.test(path))
          throw Error("Unexpected model resource");
        engine.FS.writeFile(
          "/g1/meshes/" + path.split("/").pop(),
          new Uint8Array(await (await get(path.slice(1))).arrayBuffer()),
        );
      }),
    );
    xml = xml
      .replaceAll("/robots/g1/meshes/", "meshes/")
      .replace("<compiler ", '<compiler usethread="false" ');
    engine.FS.writeFile("/g1/model.urdf", xml);
    model = engine.MjModel.mj_loadXML("/g1/model.urdf");
    if (model.nq !== 23 || model.nv !== 23 || model.nu !== 0)
      throw Error("Unsupported model configuration");
    model.opt.timestep = 0.001;
    profile = await (await get("vendor/mujoco/profile.json")).json();
    profile = {
      ...profile,
      engineVersion: engine.mj_versionString(),
      runtime: "browser WebAssembly worker",
      distribution: "mujoco npm 3.1.16; community-published canonical bindings",
      compilerOverride: "usethread=false (single-thread compilation only)",
    };
  })();
  return initializing;
}
function trial(joint, torque, steps) {
  const e = engine,
    m = model,
    d = new e.MjData(m);
  try {
    e.mj_forward(m, d);
    const j = e.mj_name2id(m, 3, joint),
      qa = m.jnt_qposadr[j],
      va = m.jnt_dofadr[j];
    const names = profile.joints.map((x) => x.name);
    let contacts = d.ncon,
      excess = 0;
    const sample = () => ({
      time: d.time,
      jointPositionRad: d.qpos[qa],
      jointVelocityRadS: d.qvel[va],
      contactCount: d.ncon,
      positions: Object.fromEntries(
        names.map((n) => [n, d.qpos[m.jnt_qposadr[e.mj_name2id(m, 3, n)]]]),
      ),
    });
    const samples = [sample()];
    for (let k = 1; k <= steps; k++) {
      d.qfrc_applied.fill(0);
      d.qfrc_applied[va] = torque;
      e.mj_step(m, d);
      if (
        ![...d.qpos, ...d.qvel, ...d.qacc].every(Number.isFinite) ||
        Math.abs(d.time - k * 0.001) > 1e-9
      )
        throw Error("Invalid physics state");
      contacts = Math.max(contacts, d.ncon);
      for (let i = 0; i < m.njnt; i++)
        if (m.jnt_limited[i])
          excess = Math.max(
            excess,
            m.jnt_range[i * 2] - d.qpos[m.jnt_qposadr[i]],
            d.qpos[m.jnt_qposadr[i]] - m.jnt_range[i * 2 + 1],
          );
      if (k % 10 === 0 || k === steps) samples.push(sample());
    }
    return {
      torqueNm: torque,
      steps,
      durationSeconds: d.time,
      finite: true,
      maxContactCount: contacts,
      maxJointLimitExcessRad: excess,
      initial: samples[0],
      final: samples.at(-1),
      samples,
      warnings: Array.from({ length: d.warning.size() }, (_, i) => {
        const w = d.warning.get(i);
        return { index: i, count: w.number, lastInfo: w.lastinfo };
      }).filter((w) => w.count > 0),
    };
  } finally {
    d.delete();
  }
}
self.onmessage = async ({ data: { id, action, payload, base } }) => {
  try {
    await setup(base);
    if (action === "profile") {
      self.postMessage({ id, result: profile });
      return;
    }
    if (
      action !== "simulate" ||
      !payload ||
      typeof payload !== "object" ||
      Object.keys(payload).some(
        (k) => !["joint", "torque", "duration"].includes(k),
      )
    )
      throw Error("Unsupported request");
    const {
      joint = "left_elbow_joint",
      torque = 0.2,
      duration = 0.2,
    } = payload;
    if (
      !profile.joints.some((j) => j.name === joint) ||
      typeof torque !== "number" ||
      !Number.isFinite(torque) ||
      Math.abs(torque) > 0.5 ||
      typeof duration !== "number" ||
      !Number.isFinite(duration) ||
      duration < 0.01 ||
      duration > 0.5
    )
      throw Error("Request outside allowed bounds");
    const steps = Math.round(duration / 0.001),
      baseline = trial(joint, 0, steps),
      controlled = trial(joint, torque, steps),
      delta =
        controlled.final.jointPositionRad - baseline.final.jointPositionRad;
    self.postMessage({
      id,
      result: {
        profile,
        request: { joint, torque, duration: steps * 0.001 },
        baseline,
        controlled,
        comparison: {
          finalPositionDeltaRad: delta,
          differentResult: Math.abs(delta) > 1e-9,
          sameInitialState:
            JSON.stringify(baseline.initial) ===
            JSON.stringify(controlled.initial),
        },
      },
    });
  } catch (error) {
    self.postMessage({
      id,
      error: String(error?.message || error),
      fatal: !profile,
    });
  }
};
