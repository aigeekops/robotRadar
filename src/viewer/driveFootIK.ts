import * as THREE from "three";
import type { URDFRobot } from "urdf-loader";
import { finiteDampedStep, footTrajectory } from "../core/driveGait";
/** Bounded source-chain IK for visual foot placement. No simulated forces or hardware commands. */
export function createDriveFootIK(robot: URDFRobot, carrier: THREE.Group) {
  const sides = ["left", "right"] as const;
  const legs = sides.map((side) => ({
    side,
    foot: robot.links[`${side}_ankle_roll_link`],
    names: [
      `${side}_hip_pitch_joint`,
      `${side}_hip_roll_joint`,
      `${side}_knee_joint`,
    ],
    neutral: new THREE.Vector3(),
  }));
  if (
    legs.some(
      (leg) => !leg.foot || leg.names.some((name) => !robot.joints[name]),
    )
  )
    return null;
  // Preserve the source standing foot anchors, then lower the presentation pelvis to leave reach margin.
  carrier.updateMatrixWorld(true);
  for (const leg of legs)
    leg.neutral.copy(
      carrier.worldToLocal(leg.foot.getWorldPosition(new THREE.Vector3())),
    );
  const standingRootY = robot.position.y;
  robot.position.y = standingRootY - 0.045;
  for (const side of sides) {
    robot.setJointValue(`${side}_hip_pitch_joint`, -0.22);
    robot.setJointValue(`${side}_knee_joint`, 0.44);
    robot.setJointValue(`${side}_ankle_pitch_joint`, -0.22);
  }
  carrier.updateMatrixWorld(true);
  const origin = new THREE.Vector3(),
    foot = new THREE.Vector3(),
    axis = new THREE.Vector3(),
    rotation = new THREE.Quaternion();
  const lastTargets = new Map<string, THREE.Vector3>();
  return {
    update(travel: number, blend: number) {
      // Blend follows smoothed movement intensity: retain reach margin while stepping,
      // then return to a lightly flexed source stance instead of a permanent crouch.
      robot.position.y =
        standingRootY - (0.005 + 0.04 * Math.max(0, Math.min(1, blend)));
      let maxError = 0;
      const evidence: Record<
        string,
        { stance: boolean; target: number[]; actual: number[]; error: number }
      > = {};
      for (const leg of legs) {
        const path = footTrajectory(travel, leg.side, blend);
        const local = leg.neutral.clone();
        local.x += path.forward;
        local.y += path.lift;
        const target = carrier.localToWorld(local);
        lastTargets.set(leg.side, target.clone());
        let valid = true;
        const before = leg.names.map(
          (name) => robot.joints[name].jointValue[0],
        );
        for (let iteration = 0; iteration < 4; iteration++) {
          carrier.updateMatrixWorld(true);
          leg.foot.getWorldPosition(foot);
          const error = target.clone().sub(foot);
          if (error.length() < 0.0015) break;
          const columns = leg.names.map((name) => {
            const joint = robot.joints[name];
            joint.getWorldPosition(origin);
            joint.getWorldQuaternion(rotation);
            axis.copy(joint.axis).applyQuaternion(rotation).normalize();
            return axis.clone().cross(foot.clone().sub(origin));
          });
          const delta = finiteDampedStep(
            [
              [columns[0].x, columns[1].x, columns[2].x],
              [columns[0].y, columns[1].y, columns[2].y],
              [columns[0].z, columns[1].z, columns[2].z],
            ],
            error.toArray(),
          );
          if (delta.some((v) => !Number.isFinite(v))) {
            valid = false;
            break;
          }
          leg.names.forEach((name, i) => {
            const joint = robot.joints[name];
            const lower = name.includes("knee")
              ? Math.max(0.04, joint.limit.lower)
              : joint.limit.lower;
            robot.setJointValue(
              name,
              Math.max(
                lower,
                Math.min(joint.limit.upper, joint.jointValue[0] + delta[i]),
              ),
            );
          });
        }
        if (!valid)
          leg.names.forEach((name, i) => robot.setJointValue(name, before[i]));
        const pitch = robot.joints[leg.names[0]].jointValue[0],
          roll = robot.joints[leg.names[1]].jointValue[0],
          knee = robot.joints[leg.names[2]].jointValue[0];
        for (const [name, value] of [
          [`${leg.side}_ankle_pitch_joint`, -pitch - knee],
          [`${leg.side}_ankle_roll_joint`, -roll],
        ] as [string, number][]) {
          const j = robot.joints[name];
          if (j)
            robot.setJointValue(
              name,
              Math.max(j.limit.lower, Math.min(j.limit.upper, value)),
            );
        }
        carrier.updateMatrixWorld(true);
        leg.foot.getWorldPosition(foot);
        const error = foot.distanceTo(target);
        maxError = Math.max(maxError, error);
        evidence[leg.side] = {
          stance: path.stance,
          target: target.toArray(),
          actual: foot.toArray(),
          error,
        };
      }
      return { maxError, feet: evidence };
    },
  };
}
