import { parsePartEvidence } from "./partEvidence";
import type { JointInfo, Lang, RobotEntry } from "../types";
import { boundedHandPose, handDriveLimits } from "./handLab";
import { handDefinitionForRobot } from "./handRegistry";
export type MotionFrame = { time: number; joints: Record<string, number> };
export type ExperimentPackage = {
  schemaVersion: 1;
  robotId: string;
  sourceCommit: string;
  urdfUrl: string;
  program: string;
  trace: [];
};
/** Shared extraction of the real App.runProgram input contract. Does not execute anything. */
export function parseMotionProgram(
  program: string,
  joints: JointInfo[],
  lang: Lang = "zh",
): MotionFrame[] {
  const t = (zh: string, en: string) => (lang === "zh" ? zh : en);
  if (typeof program !== "string" || program.length > 100000)
    throw Error(t("程序过大或格式错误", "Program too large or invalid"));
  const parsed: unknown = JSON.parse(program);
  const frames =
    parsed && typeof parsed === "object"
      ? (parsed as { frames?: unknown }).frames
      : null;
  if (!Array.isArray(frames) || frames.length < 2 || frames.length > 100)
    throw Error(t("需要 2–100 个关键帧", "Use 2–100 keyframes"));
  let previous = -1;
  for (const [i, frame] of frames.entries()) {
    if (
      !frame ||
      typeof frame !== "object" ||
      !Number.isFinite(frame.time) ||
      frame.time <= previous ||
      frame.time < 0 ||
      frame.time > 60 ||
      (i === 0 && frame.time !== 0)
    )
      throw Error(
        t(
          "时间必须从 0 开始严格递增，最长 60 秒",
          "Times must increase from 0, up to 60 seconds",
        ),
      );
    previous = frame.time;
    if (
      !frame.joints ||
      Array.isArray(frame.joints) ||
      typeof frame.joints !== "object"
    )
      throw Error("Invalid joints");
    for (const [name, value] of Object.entries(frame.joints)) {
      const joint = joints.find((j) => j.name === name);
      if (
        !joint ||
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        !Number.isFinite(joint.lower) ||
        !Number.isFinite(joint.upper) ||
        value < joint.lower ||
        value > joint.upper
      )
        throw Error(
          `${name}: ${t("未知关节或超出限位", "unknown joint or outside limits")}`,
        );
    }
  }
  return frames as MotionFrame[];
}
/** Source-backed teaching bounds, including mimic follower constraints. Not new hardware specifications. */
export function experimentJoints(
  robot: Pick<RobotEntry, "id" | "sourceCommit">,
  independentJoints: JointInfo[],
): JointInfo[] {
  const hand = handDefinitionForRobot(robot.id);
  const joints = independentJoints.filter((j) => j.type !== "fixed");
  if (
    !joints.length ||
    joints.some(
      (j) =>
        !Number.isFinite(j.lower) ||
        !Number.isFinite(j.upper) ||
        j.lower > j.upper,
    )
  )
    throw Error(
      "Load valid independent source joints before creating a template",
    );
  if (
    hand &&
    (hand.revision !== robot.sourceCommit ||
      hand.joints
        .filter((j) => !j.mimic)
        .some(
          (source) =>
            !joints.some(
              (j) =>
                j.name === source.name &&
                j.type === source.type &&
                Math.abs(j.lower - source.lower) < 1e-6 &&
                Math.abs(j.upper - source.upper) < 1e-6,
            ),
        ))
  )
    throw Error("Hand source revision or drive configuration differs");
  const effective = joints.map((j) => ({
    ...j,
    ...(hand ? handDriveLimits(hand, j.name) : {}),
  }));
  if (
    effective.some(
      (j) =>
        !Number.isFinite(j.lower) ||
        !Number.isFinite(j.upper) ||
        j.lower > j.upper,
    )
  )
    throw Error("Invalid effective coupled limits");
  return effective;
}
/** Call only with the current loaded model's independent JointInfo (Viewer excludes fixed/mimic). */
export function createExperimentTemplate(
  robot: RobotEntry,
  independentJoints: JointInfo[],
): ExperimentPackage {
  if (!robot.sourceCommit || !/^[a-f0-9]{40,64}$/i.test(robot.sourceCommit))
    throw Error("A pinned source revision is required");
  const hand = handDefinitionForRobot(robot.id);
  const effective = experimentJoints(robot, independentJoints);
  const home = hand
    ? boundedHandPose(hand)
    : Object.fromEntries(
        effective.map((j) => [j.name, Math.max(j.lower, Math.min(j.upper, 0))]),
      );
  const preferred = [
    "head_yaw",
    "waist_yaw_joint",
    "torso_joint",
    "wrist_roll",
    "wrist_3_joint",
    "fr3_finger_joint1",
    "panda_finger_joint1",
    "wheel_left_joint",
  ];
  const movable = effective.filter((j) => j.upper - j.lower > 1e-9);
  const selected =
    preferred
      .map((name) => movable.find((j) => j.name === name))
      .find(Boolean) || movable[0];
  if (!selected) throw Error("No independent movable joint available");
  const span = selected.upper - selected.lower;
  const step = Math.min(
    span * 0.05,
    selected.type === "prismatic" ? 0.003 : 0.08,
  );
  const base = home[selected.name];
  const direction = selected.upper - base >= base - selected.lower ? 1 : -1;
  const target = {
    ...home,
    [selected.name]: Math.max(
      selected.lower,
      Math.min(selected.upper, base + direction * step),
    ),
  };
  const frames: MotionFrame[] = [
    { time: 0, joints: home },
    { time: 2, joints: hand ? boundedHandPose(hand, target) : target },
    { time: 4, joints: { ...home } },
  ];
  const program = JSON.stringify({ frames }, null, 2);
  parseMotionProgram(program, effective);
  return {
    schemaVersion: 1,
    robotId: robot.id,
    sourceCommit: robot.sourceCommit,
    urdfUrl: robot.urdfUrl,
    program,
    trace: [],
  };
}
export function experimentTemplateFilename(
  robot: Pick<RobotEntry, "id">,
): string {
  return `${robot.id.replace(/[^a-zA-Z0-9_-]/g, "_")}-experiment-template.json`;
}

/** Parse only the known target catalog asset, never a URL supplied by the imported file. */
export function parseExperimentJoints(
  robot: Pick<RobotEntry, "id" | "sourceCommit">,
  targetUrdfText: string,
): JointInfo[] {
  const evidence = parsePartEvidence(targetUrdfText);
  const joints: JointInfo[] = evidence.joints
    .filter((j) => j.type !== "fixed" && !j.mimic)
    .map((j) => {
      if (!["revolute", "prismatic", "continuous"].includes(j.type))
        throw Error("Unsupported independent joint type");
      const lower = j.type === "continuous" ? -Math.PI : j.lower,
        upper = j.type === "continuous" ? Math.PI : j.upper;
      if (
        lower === null ||
        upper === null ||
        !Number.isFinite(lower) ||
        !Number.isFinite(upper) ||
        lower > upper
      )
        throw Error("Missing source joint limits");
      return { name: j.name, type: j.type, lower, upper, value: 0 };
    });
  return experimentJoints(robot, joints);
}
