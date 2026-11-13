/** Visual-model assembly state machine; not a physical service procedure. */
export type BuildPhase = "pick" | "flying" | "confirm" | "complete";
export type BuildSession = {
  step: number;
  phase: BuildPhase;
  fly: number;
  marker: number;
  held: boolean;
  confirmation: number;
  elapsed: number;
  started: boolean;
  auto: boolean;
  paused: boolean;
  errors: number;
};
export const initialBuild = (): BuildSession => ({
  step: 0,
  phase: "pick",
  fly: 0,
  marker: 0,
  held: false,
  confirmation: 0,
  elapsed: 0,
  started: false,
  auto: false,
  paused: false,
  errors: 0,
});
export function chooseBuildPart(
  state: BuildSession,
  index: number,
  total: number,
): BuildSession {
  if (state.phase !== "pick" || state.paused || total < 1) return state;
  if (index !== state.step) return { ...state, errors: state.errors + 1 };
  return { ...state, phase: "flying", fly: 0, started: true };
}
export function holdBuildMarker(
  state: BuildSession,
  marker: number,
  held: boolean,
): BuildSession {
  if (state.phase !== "confirm" || state.paused || marker !== state.marker)
    return state;
  return { ...state, held, confirmation: held ? state.confirmation : 0 };
}
export function tickBuild(
  state: BuildSession,
  seconds: number,
  total: number,
): BuildSession {
  if (
    !Number.isFinite(seconds) ||
    seconds <= 0 ||
    state.paused ||
    state.phase === "complete" ||
    total < 1
  )
    return state;
  const dt = Math.min(seconds, 0.1);
  let next = { ...state, elapsed: state.elapsed + (state.started ? dt : 0) };
  if (state.phase === "pick") {
    return state.auto ? chooseBuildPart(next, state.step, total) : next;
  }
  if (state.phase === "flying") {
    next.fly = Math.min(1, state.fly + dt / 0.8);
    if (next.fly === 1) {
      next.phase = "confirm";
      next.marker = 0;
      next.confirmation = 0;
      next.held = false;
    }
    return next;
  }
  if (state.phase === "confirm" && (state.held || state.auto)) {
    next.confirmation = Math.min(1, state.confirmation + dt / 0.65);
    if (next.confirmation === 1) {
      next.confirmation = 0;
      next.held = false;
      if (state.marker === 0) next.marker = 1;
      else {
        next.step += 1;
        next.marker = 0;
        next.fly = 0;
        next.phase = next.step === total ? "complete" : "pick";
        if (next.phase === "complete") next.auto = false;
      }
    }
  }
  return next;
}
export function undoBuild(state: BuildSession): BuildSession {
  return {
    ...state,
    step: Math.max(0, state.step - 1),
    phase: "pick",
    fly: 0,
    marker: 0,
    held: false,
    confirmation: 0,
    auto: false,
    paused: false,
  };
}
export function topologicalVisualLinks(
  links: string[],
  joints: { parent: string; child: string }[],
  visual: Set<string>,
): string[] {
  const known = new Set(links),
    children = new Map<string, string[]>();
  const childNames = new Set(joints.map((j) => j.child));
  for (const joint of joints) {
    if (!known.has(joint.parent) || !known.has(joint.child))
      throw Error("Unknown link in source topology");
    children.set(joint.parent, [
      ...(children.get(joint.parent) || []),
      joint.child,
    ]);
  }
  const queue = links.filter((name) => !childNames.has(name));
  const seen = new Set<string>(),
    result: string[] = [];
  while (queue.length) {
    const name = queue.shift()!;
    if (seen.has(name)) throw Error("Repeated link or cycle");
    seen.add(name);
    if (visual.has(name)) result.push(name);
    queue.push(...(children.get(name) || []));
  }
  if (seen.size !== known.size)
    throw Error("Source topology is not an acyclic tree");
  return result;
}
