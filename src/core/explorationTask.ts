import type { ModelInfo, RobotEntry } from "../types";
import { parsePartEvidence } from "./partEvidence";
import { experimentJoints } from "./experimentTemplate";
export const EXPLORATION_TASK_VERSION = 1;
export type ExplorationTask = {
  key: string;
  robotId: string;
  sourceCommit: string;
  digest: string;
  version: number;
  link: string;
  joint: string;
  parent: string;
  jointType: "revolute" | "prismatic" | "continuous";
  axis: [number, number, number] | null;
  unit: "rad" | "m";
  lower: number;
  upper: number;
  target: number;
  tolerance: number;
};
export type TaskObservation = {
  selected: string | null;
  value: number;
  mode: string;
};
export type TaskSession = {
  key: string;
  phase: "idle" | "select" | "move" | "reset" | "complete";
  armed: boolean;
  evidence: TaskObservation[];
};
export function createExplorationTask(
  robot: RobotEntry,
  info: ModelInfo,
  xml: string,
  digest: string,
): ExplorationTask {
  if (!robot.sourceCommit || !/^([a-f0-9]{64})$/i.test(digest))
    throw Error("Pinned source identity unavailable");
  const source = parsePartEvidence(xml),
    names = Object.keys(source.links);
  if (
    new Set(info.parts).size !== names.length ||
    info.parts.length !== names.length ||
    names.some((n) => !info.parts.includes(n))
  )
    throw Error("Loaded links do not match source");
  const independent = source.joints.filter(
    (j) => !j.mimic && j.type !== "fixed",
  );
  if (
    info.joints.length !== independent.length ||
    new Set(info.joints.map((j) => j.name)).size !== independent.length
  )
    throw Error("Loaded independent joints do not match source");
  for (const sourceJoint of independent) {
    const loaded = info.joints.find((j) => j.name === sourceJoint.name);
    const lower =
        sourceJoint.type === "continuous" ? -Math.PI : sourceJoint.lower,
      upper = sourceJoint.type === "continuous" ? Math.PI : sourceJoint.upper;
    if (
      !loaded ||
      !["revolute", "prismatic", "continuous"].includes(sourceJoint.type) ||
      loaded.type !== sourceJoint.type ||
      lower === null ||
      upper === null ||
      !Number.isFinite(lower) ||
      !Number.isFinite(upper) ||
      Math.abs(loaded.lower - lower) > 1e-6 ||
      Math.abs(loaded.upper - upper) > 1e-6
    )
      throw Error("Loaded joint limits do not match source");
  }
  const effective = experimentJoints(robot, info.joints);
  const candidates = independent
    .filter((j) => {
      const bounds = effective.find((v) => v.name === j.name);
      return (
        !!bounds &&
        bounds.lower <= 0 &&
        bounds.upper >= 0 &&
        (source.links[j.child]?.visualCount || 0) > 0 &&
        Math.min(
          j.type === "prismatic" ? 0.005 : 0.15,
          Math.max(bounds.upper, -bounds.lower) * 0.2,
        ) > (j.type === "prismatic" ? 0.0012 : 0.012)
      );
    })
    .sort(
      (a, b) =>
        (source.links[b.child]?.visualCount || 0) -
        (source.links[a.child]?.visualCount || 0),
    );
  const joint = candidates[0];
  if (!joint)
    throw Error(
      "No verified independent axis with a valid zero and nonzero span",
    );
  const bounds = effective.find((j) => j.name === joint.name)!;
  const positive = bounds.upper >= -bounds.lower;
  const available = positive ? bounds.upper : -bounds.lower;
  const distance = Math.min(
    joint.type === "prismatic" ? 0.005 : 0.15,
    available * 0.2,
  );
  if (distance < 1e-6)
    throw Error("Source range too small for a reliable task");
  const target = (positive ? 1 : -1) * distance;
  return {
    key: `exploration-task:v${EXPLORATION_TASK_VERSION}:${encodeURIComponent(robot.id)}:${encodeURIComponent(robot.sourceCommit)}:${digest}`,
    robotId: robot.id,
    sourceCommit: robot.sourceCommit,
    digest,
    version: EXPLORATION_TASK_VERSION,
    link: joint.child,
    joint: joint.name,
    parent: joint.parent,
    jointType: joint.type as ExplorationTask["jointType"],
    axis:
      joint.axis && joint.axis.some((v) => v !== 0) ? [...joint.axis] : null,
    unit: joint.type === "prismatic" ? "m" : "rad",
    lower: bounds.lower,
    upper: bounds.upper,
    target,
    tolerance: Math.max(
      distance * 0.12,
      joint.type === "prismatic" ? 0.0006 : 0.006,
    ),
  };
}
export function idleExploration(task: ExplorationTask): TaskSession {
  return { key: task.key, phase: "idle", armed: false, evidence: [] };
}
export function startExploration(task: ExplorationTask): TaskSession {
  return { ...idleExploration(task), phase: "select" };
}
export function observeExploration(
  task: ExplorationTask,
  state: TaskSession,
  observation: TaskObservation,
): TaskSession {
  if (state.key !== task.key) return idleExploration(task);
  if (
    state.phase === "idle" ||
    state.phase === "complete" ||
    !Number.isFinite(observation.value) ||
    observation.value < task.lower - 1e-9 ||
    observation.value > task.upper + 1e-9
  )
    return state;
  const event = {
    selected: observation.selected,
    value: observation.value,
    mode: observation.mode,
  };
  if (
    state.phase === "select" &&
    event.mode === "parts" &&
    event.selected === task.link
  )
    return {
      ...state,
      phase: "move",
      armed: false,
      evidence: [...state.evidence, event],
    };
  if (state.phase === "move" && event.mode === "joints") {
    const atTarget = Math.abs(event.value - task.target) <= task.tolerance;
    if (!atTarget && !state.armed)
      return { ...state, armed: true, evidence: [...state.evidence, event] };
    if (atTarget && state.armed)
      return { ...state, phase: "reset", evidence: [...state.evidence, event] };
  }
  if (
    state.phase === "reset" &&
    event.mode === "joints" &&
    Math.abs(event.value) <= task.tolerance
  )
    return {
      ...state,
      phase: "complete",
      evidence: [...state.evidence, event],
    };
  return state;
}
/** Only replay a bounded observation transcript, never trust a stored completed checkbox. Local learning record, not certification. */
export function restoreExploration(
  task: ExplorationTask,
  raw: string | null,
): TaskSession {
  try {
    if (!raw || raw.length > 12000) return idleExploration(task);
    const data = JSON.parse(raw);
    if (
      data.key !== task.key ||
      data.version !== task.version ||
      !Array.isArray(data.evidence) ||
      data.evidence.length !== 4
    )
      return idleExploration(task);
    let state = startExploration(task);
    for (const event of data.evidence) {
      if (
        !event ||
        !["parts", "joints"].includes(event.mode) ||
        (event.selected !== null && typeof event.selected !== "string") ||
        typeof event.value !== "number"
      )
        return idleExploration(task);
      state = observeExploration(task, state, event);
    }
    return state.phase === "complete" ? state : idleExploration(task);
  } catch {
    return idleExploration(task);
  }
}
export function serializeExploration(
  task: ExplorationTask,
  state: TaskSession,
): string | null {
  if (state.key !== task.key || state.phase !== "complete") return null;
  return JSON.stringify({
    key: task.key,
    version: task.version,
    evidence: state.evidence,
  });
}
