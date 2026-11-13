/** Authored teaching scenario. All displayed motion comes from MuJoCo integration. */
export const GRASP_TARGET = [
  0, 1.32, 0.99, 0.77, 0, 1.32, 0.99, 0.77, 0, 1.32, 0.99, 0.77, 2, 0.4, -0.2,
  0.7,
];
export function createGraspSimulation(
  engine,
  model,
  { timestep = 0.001 } = {},
) {
  model.opt.timestep = timestep;
  const e = engine,
    m = model,
    d = new e.MjData(m),
    force = new e.DoubleBuffer(6);
  const id = (kind, name) => e.mj_name2id(m, kind, name);
  const lift = id(3, "lift"),
    la = m.jnt_qposadr[lift],
    lv = m.jnt_dofadr[lift],
    oj = id(3, "object_free"),
    oq = m.jnt_qposadr[oj],
    ov = m.jnt_dofadr[oj],
    obj = id(1, "object");
  if (
    lift < 0 ||
    oj < 0 ||
    m.nq !== 24 ||
    m.nv !== 23 ||
    m.nu !== 0 ||
    m.neq !== 0
  )
    throw Error("Unexpected grasp model");
  const linkBodies = Array.from({ length: m.nbody }, (_, index) => ({
    index,
    name: e.mj_id2name(m, 1, index),
  })).filter(
    (x) => x.name && !["world", "object", "carriage"].includes(x.name),
  );
  const joints = GRASP_TARGET.map((_, n) => {
    const j = id(3, "" + n);
    if (j < 0) throw Error("Missing source joint");
    return { n, q: m.jnt_qposadr[j], v: m.jnt_dofadr[j] };
  });
  let phase = "ready",
    phaseStart = 0,
    holdSeconds = 0,
    placeSeconds = 0,
    earnedHold = false,
    anchor = null,
    hasGrasp = false,
    failure = null,
    disposed = false;
  let latest;
  e.mj_forward(m, d);
  function inspect() {
    let support = false;
    const contacts = [],
      cs = d.contact;
    for (let i = 0; i < d.ncon; i++) {
      const c = cs.get(i);
      if (m.geom_bodyid[c.geom1] === obj || m.geom_bodyid[c.geom2] === obj) {
        const other = m.geom_bodyid[c.geom1] === obj ? c.geom2 : c.geom1,
          name = e.mj_id2name(m, 1, m.geom_bodyid[other]),
          geom = e.mj_id2name(m, 5, other);
        if (geom === "table" || geom?.startsWith("seat")) support = true;
        e.mj_contactForce(m, d, i, force.GetView());
        const f = force.GetView();
        const sign = m.geom_bodyid[c.geom2] === obj ? 1 : -1;
        const worldForce = [0, 1, 2].map(
          (axis) =>
            sign *
            (c.frame[axis] * f[0] +
              c.frame[3 + axis] * f[1] +
              c.frame[6 + axis] * f[2]),
        );
        contacts.push({
          force: worldForce,
          body: name,
          normal: force.GetView()[0],
          distance: c.dist,
          position: Array.from(c.pos),
        });
      }
      c.delete();
    }
    cs.delete();
    const position = Array.from(d.xpos).slice(obj * 3, obj * 3 + 3),
      quaternion = Array.from(d.qpos).slice(oq + 3, oq + 7),
      speed = Math.hypot(...Array.from(d.qvel).slice(ov, ov + 3)),
      angularSpeed = Math.hypot(...Array.from(d.qvel).slice(ov + 3, ov + 6));
    return {
      time: d.time,
      linkPositions: Object.fromEntries(
        linkBodies.map((b) => [
          b.name,
          Array.from(d.xpos).slice(b.index * 3, b.index * 3 + 3),
        ]),
      ),
      phase,
      joints: Object.fromEntries(joints.map((j) => [j.n, d.qpos[j.q]])),
      lift: d.qpos[la],
      position,
      quaternion,
      speed,
      angularSpeed,
      contacts,
      support,
      holdSeconds,
      placeSeconds,
      earnedHold,
      hasGrasp,
      failure,
    };
  }
  latest = inspect();
  function command(action) {
    if (disposed) throw Error("Disposed engine");
    if (action === "grasp" && phase === "ready" && d.time >= 0.4) {
      phase = "grasping";
      phaseStart = d.time;
    } else if (action === "lift" && phase === "grasped" && hasGrasp) {
      phase = "lifting";
      phaseStart = d.time;
    } else if (action === "place" && phase === "holding" && earnedHold) {
      phase = "placing";
      phaseStart = d.time;
    } else throw Error("Action not available yet");
    latest = { ...latest, phase };
    return latest;
  }
  function step(count = 20) {
    if (disposed) throw Error("Disposed engine");
    if (!Number.isInteger(count) || count < 1 || count > 100)
      throw Error("Invalid step batch");
    if (phase === "failed" || phase === "complete") return latest;
    for (let k = 0; k < count; k++) {
      const t = d.time - phaseStart;
      let closure =
        phase === "ready" ? 0 : phase === "grasping" ? Math.min(1, t / 2) : 1;
      let height = ["lifting", "holding"].includes(phase)
        ? phase === "lifting"
          ? Math.min(0.05, t * 0.025)
          : 0.05
        : 0;
      if (phase === "placing") {
        height =
          t < 2
            ? 0.05 - t * 0.025
            : t < 4
              ? 0
              : Math.min(0.05, (t - 4) * 0.025);
        closure = t < 2 ? 1 : Math.max(0, 1 - (t - 2) / 2);
      }
      d.qfrc_applied.fill(0);
      d.qfrc_applied[lv] = Math.max(
        -20,
        Math.min(
          20,
          1000 * (height - d.qpos[la]) - 40 * d.qvel[lv] + 0.746 * 9.81,
        ),
      );
      for (const j of joints)
        d.qfrc_applied[j.v] = Math.max(
          -0.2,
          Math.min(0.2, 0.8 * (GRASP_TARGET[j.n] * closure - d.qpos[j.q])),
        );
      e.mj_step(m, d);
      if (
        ![...d.qpos, ...d.qvel, ...d.qacc].every(Number.isFinite) ||
        d.time > 120
      )
        throw Error("Simulation safety limit");
      latest = inspect();
      const thumb = latest.contacts.some(
          (c) => c.body.includes("thumb") && c.normal > 0.001,
        ),
        finger = latest.contacts.some(
          (c) => /^(fingertip|dip)(_[23])?$/.test(c.body) && c.normal > 0.001,
        );
      hasGrasp = thumb && finger;
      if (phase === "grasping" && d.time - phaseStart >= 2.5) phase = "grasped";
      if (phase === "lifting" && d.time - phaseStart >= 2) {
        phase = "holding";
        phaseStart = d.time;
      }
      const stable =
        hasGrasp &&
        !latest.support &&
        latest.position[2] > 0.1 &&
        latest.speed < 0.01 &&
        latest.angularSpeed < 0.1 &&
        Math.abs(d.qvel[lv]) < 0.001;
      if (stable && ["lifting", "holding"].includes(phase)) {
        anchor ??= latest.position.slice();
        if (
          Math.hypot(...latest.position.map((v, i) => v - anchor[i])) > 0.002
        ) {
          holdSeconds = 0;
          anchor = latest.position.slice();
        }
        holdSeconds += timestep;
        if (holdSeconds >= 1) earnedHold = true;
      } else {
        holdSeconds = 0;
        anchor = null;
      }
      const placed =
        earnedHold &&
        phase === "placing" &&
        t > 4 &&
        latest.support &&
        !latest.contacts.some((c) => c.body !== "world") &&
        Math.hypot(latest.position[0] + 0.045, latest.position[1] + 0.035) <
          0.025 &&
        latest.speed < 0.01 &&
        latest.angularSpeed < 0.2;
      placeSeconds = placed ? placeSeconds + timestep : 0;
      if (phase === "placing" && t >= 6 && placeSeconds >= 1)
        phase = "complete";
      if (
        latest.position[2] < -0.02 ||
        Math.hypot(latest.position[0] + 0.045, latest.position[1] + 0.035) > 0.2
      ) {
        phase = "failed";
        failure = "Object escaped the task area";
      }
      if (phase === "placing" && t > 10 && phase !== "complete") {
        phase = "failed";
        failure = "Stable placement not achieved";
      }
      latest = {
        ...latest,
        phase,
        holdSeconds,
        placeSeconds,
        earnedHold,
        hasGrasp,
        failure,
      };
      if (phase === "failed" || phase === "complete") break;
    }
    return latest;
  }
  return {
    command,
    step,
    snapshot: () => latest,
    dispose() {
      if (disposed) return;
      disposed = true;
      force.delete();
      d.delete();
    },
  };
}
