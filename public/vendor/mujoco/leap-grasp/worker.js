import initialize from "../mujoco.js";
import { createGraspSimulation } from "./runtime.js";
let engine,
  model,
  simulation,
  timer = null,
  initializing = false,
  active = false,
  disposed = false;
const send = (id, result, error) => self.postMessage({ id, result, error });
const halt = () => {
  if (timer) clearInterval(timer);
  timer = null;
  active = false;
};
async function setup(base) {
  if (simulation) return simulation.snapshot();
  if (initializing) throw Error("Engine is loading");
  initializing = true;
  const root = new URL(base);
  if (root.origin !== self.location.origin)
    throw Error("Same-origin assets required");
  const abort = new AbortController(),
    timeout = setTimeout(() => abort.abort(), 45000);
  const get = async (path) => {
    const r = await fetch(new URL(path, root), { signal: abort.signal });
    if (!r.ok) throw Error(`Missing asset: ${path}`);
    return r;
  };
  const hash = async (buffer) =>
    Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("");
  try {
    const profile = await (
      await get("vendor/mujoco/leap-grasp/profile.json")
    ).json();
    const modelBytes = await (
      await get("vendor/mujoco/leap-grasp/model.xml")
    ).arrayBuffer();
    if ((await hash(modelBytes)) !== profile.mjcfSha256)
      throw Error("Model hash mismatch");
    const provenance = await (
      await get("robots/leap_hand/provenance.json")
    ).json();
    if (provenance.commit !== profile.sourceCommit)
      throw Error("Source revision mismatch");
    engine = await initialize({
      locateFile: (p) => new URL("../" + p, import.meta.url).href,
    });
    if (engine.mj_versionString() !== profile.engineVersion)
      throw Error("Engine version mismatch");
    engine.FS.mkdir("/leap");
    const xml = new TextDecoder().decode(modelBytes),
      files = [
        ...new Set([...xml.matchAll(/file="([^"]+)"/g)].map((m) => m[1])),
      ];
    if (files.length !== 8) throw Error("Unexpected source mesh count");
    for (const file of files) {
      if (!/^[a-z_]+\.stl$/.test(file)) throw Error("Unexpected mesh path");
      const entry = provenance.files.find((f) => f.file === file);
      if (!entry) throw Error("Missing mesh provenance");
      const bytes = await (await get("robots/leap_hand/" + file)).arrayBuffer();
      if ((await hash(bytes)) !== entry.sha256)
        throw Error("Mesh hash mismatch");
      engine.FS.writeFile("/leap/" + file, new Uint8Array(bytes));
    }
    engine.FS.writeFile("/leap/model.xml", xml);
    model = engine.MjModel.mj_loadXML("/leap/model.xml");
    simulation = createGraspSimulation(engine, model);
    self.postMessage({ type: "profile", profile });
    return simulation.snapshot();
  } finally {
    clearTimeout(timeout);
    initializing = false;
  }
}
function resume() {
  if (!simulation) throw Error("Engine not ready");
  if (active) return;
  active = true;
  timer = setInterval(() => {
    try {
      const snapshot = simulation.step(20);
      self.postMessage({ type: "state", snapshot, paused: false });
      if (["complete", "failed"].includes(snapshot.phase)) halt();
    } catch (error) {
      halt();
      self.postMessage({
        type: "error",
        error: String(error?.message || error),
      });
    }
  }, 20);
}
self.onmessage = async ({ data }) => {
  const { id, action, base } = data || {};
  try {
    if (disposed) throw Error("Worker disposed");
    if (action === "init") {
      const snapshot = await setup(base);
      send(id, snapshot);
      return;
    }
    if (action === "pause") {
      halt();
      send(id, simulation?.snapshot());
      return;
    }
    if (action === "resume") {
      resume();
      send(id, simulation.snapshot());
      return;
    }
    if (action === "dispose") {
      halt();
      simulation?.dispose();
      model?.delete();
      disposed = true;
      send(id, true);
      return;
    }
    if (["grasp", "lift", "place"].includes(action)) {
      if (!simulation) throw Error("Engine not ready");
      const snapshot = simulation.command(action);
      resume();
      send(id, snapshot);
      return;
    }
    throw Error("Unsupported engine command");
  } catch (error) {
    send(id, null, String(error?.message || error));
  }
};
