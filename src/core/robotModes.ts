import { MODES, type NavigationMode } from "./navigation";
import { handDefinitionForRobot } from "./handRegistry";
import { robotLessons, chainExercises } from "../robotLearning";
import { driveTaskFor } from "./driveTasks";

export type RobotExperience = "drive" | "build" | "reach" | "grasp";
export function manipulationExperienceFor(
  robot: { id: string; form: string } | null | undefined,
): "reach" | "grasp" | null {
  if (robot?.id === "leap_hand") return "grasp";
  return robot && ["panda", "fr3", "ur5e", "so101"].includes(robot.id)
    ? "reach"
    : null;
}

export function supportsRobotDrive(
  robot: { id: string; form: string } | null | undefined,
): boolean {
  return !!robot && driveTaskFor(robot) !== "stationary";
}

export function supportsRobotDynamics(
  robotId: string | null | undefined,
): boolean {
  return robotId === "g1";
}

export function normalizeRobotExperience(
  robot: { id: string; form: string } | null | undefined,
  requested: unknown,
): RobotExperience | null {
  if (!robot) return null;
  if (requested === "build") return "build";
  if (
    (requested === "reach" || requested === "grasp") &&
    manipulationExperienceFor(robot) === requested
  )
    return requested;
  return requested === "drive" && supportsRobotDrive(robot) ? "drive" : null;
}

/** Modes must be valid for the selected asset, including direct and historical URLs. */
export function supportedRobotModes(
  robotId: string | null | undefined,
): NavigationMode[] {
  return MODES.filter((mode) => {
    if (mode === "systems")
      return robotLessons.some((lesson) => lesson.robotId === robotId);
    if (mode === "assembly")
      return chainExercises.some((exercise) => exercise.robotId === robotId);
    if (mode === "hand") return !!robotId && !!handDefinitionForRobot(robotId);
    if (mode === "gripper") return robotId === "franka-hand";
    if (mode === "buildkit")
      return robotId === "so101" || robotId === "open-duck-mini";
    return true;
  });
}

export function normalizeRobotMode(
  robotId: string | null | undefined,
  requested: unknown,
): NavigationMode {
  return supportedRobotModes(robotId).includes(requested as NavigationMode)
    ? (requested as NavigationMode)
    : "parts";
}
