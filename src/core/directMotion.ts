import { boundedHandPose, handPreset, setHandFingerCurl } from "./handLab";
import { svhHandDefinition } from "./svhHandData";
import { extraDirectPresets } from "./directMotionData";
import type { JointInfo, Localized } from "../types";
export type DirectPreset = {
  id: string;
  name: Localized;
  description: Localized;
  frames: Record<string, number>[];
  duration: number;
};
export function boundedPose(
  joints: JointInfo[],
  values: Record<string, number> = {},
): Record<string, number> {
  return Object.fromEntries(
    joints
      .filter(
        (j) =>
          Number.isFinite(j.lower) &&
          Number.isFinite(j.upper) &&
          j.lower <= j.upper,
      )
      .map((j) => [
        j.name,
        Math.max(
          j.lower,
          Math.min(
            j.upper,
            Number.isFinite(values[j.name]) ? values[j.name] : 0,
          ),
        ),
      ]),
  );
}
export function directPresets(
  robotId: string,
  joints: JointInfo[],
): DirectPreset[] {
  const names = new Set(joints.map((j) => j.name));
  const result: DirectPreset[] = [];
  const add = (
    id: string,
    zh: string,
    en: string,
    detailZh: string,
    detailEn: string,
    poses: Record<string, number>[],
    duration = 5,
  ) => {
    if (!poses.every((p) => Object.keys(p).every((n) => names.has(n)))) return;
    result.push({
      id,
      name: { zh, en },
      description: { zh: detailZh, en: detailEn },
      frames: [{}, ...poses, {}].map((p) => boundedPose(joints, p)),
      duration,
    });
  };
  if (robotId === "g1") {
    const arm = {
      right_shoulder_pitch_joint: -1.1,
      right_shoulder_roll_joint: -0.25,
      right_elbow_joint: 1.1,
    };
    add(
      "wave",
      "抬臂招手",
      "Wave",
      "右肩、肘和腕的联动姿态。",
      "Coordinated shoulder, elbow and wrist poses.",
      [
        arm,
        { ...arm, right_wrist_roll_joint: -0.65 },
        { ...arm, right_wrist_roll_joint: 0.65 },
        { ...arm, right_wrist_roll_joint: -0.65 },
        arm,
      ],
      6,
    );
    add(
      "crouch",
      "下蹲姿态",
      "Crouch pose",
      "双侧髋、膝、踝屈曲；基座固定，不计算平衡或地面接触。",
      "Hip, knee and ankle flexion; fixed base, without balance or contact solving.",
      [
        {
          left_hip_pitch_joint: -0.4,
          right_hip_pitch_joint: -0.4,
          left_knee_joint: 0.8,
          right_knee_joint: 0.8,
          left_ankle_pitch_joint: -0.4,
          right_ankle_pitch_joint: -0.4,
        },
      ],
      4,
    );
  } else if (robotId === "go2") {
    const flex = Object.fromEntries(
      ["FL", "FR", "RL", "RR"].flatMap((p) => [
        [`${p}_thigh_joint`, 0.9],
        [`${p}_calf_joint`, -1.8],
      ]),
    );
    add(
      "flex",
      "四腿屈伸",
      "Leg flexion",
      "四条腿的关节姿态预览；不是步态控制器。",
      "Four-leg joint poses, not a locomotion controller.",
      [flex],
      4,
    );
    add(
      "front-leg",
      "前腿抬起",
      "Front-leg lift",
      "固定躯干下观察左前腿的屈曲。",
      "Observe left-front-leg flexion with a fixed trunk.",
      [flex, { ...flex, FL_thigh_joint: 1.3, FL_calf_joint: -2.2 }, flex],
      5,
    );
  } else if (robotId === "panda" || robotId === "fr3") {
    const p = robotId;
    const reach = {
      [`${p}_joint2`]: -0.4,
      [`${p}_joint4`]: -1.5,
      [`${p}_joint6`]: 1.6,
      [`${p}_joint7`]: 0.7,
    };
    add(
      "reach",
      "手臂伸展",
      "Arm reach",
      "关节空间插值，没有逆运动学或碰撞规避。",
      "Joint-space interpolation without IK or collision avoidance.",
      [reach],
      5,
    );
    add(
      "sweep",
      "底座转向",
      "Base sweep",
      "肩部转动与折臂姿态联动。",
      "Base rotation with a folded arm pose.",
      [
        { ...reach, [`${p}_joint1`]: -0.5 },
        { ...reach, [`${p}_joint1`]: 0.5 },
        reach,
      ],
      6,
    );
    add(
      "gripper",
      "夹爪开合",
      "Open / close gripper",
      "驱动主指；从指由 URDF mimic 关系联动，不含抓取接触。",
      "Drive the master finger; URDF mimic links the follower. No grasp contact.",
      [
        { ...reach, [`${p}_finger_joint1`]: 0.035 },
        reach,
        { ...reach, [`${p}_finger_joint1`]: 0.035 },
      ],
      5,
    );
  } else if (robotId === "ur5e") {
    const reach = {
      shoulder_lift_joint: -0.9,
      elbow_joint: 1.3,
      wrist_1_joint: -0.4,
    };
    add(
      "reach",
      "手臂伸展",
      "Arm reach",
      "六轴机械臂的关节空间姿态预览。",
      "Joint-space pose preview of the six-axis arm.",
      [reach],
      5,
    );
    add(
      "sweep",
      "底座转向",
      "Base sweep",
      "肩部旋转；模型没有可控夹爪。",
      "Shoulder rotation; this model has no actuated gripper.",
      [
        { ...reach, shoulder_pan_joint: -0.6 },
        { ...reach, shoulder_pan_joint: 0.6 },
        reach,
      ],
      6,
    );
  } else if (robotId === "so101") {
    const reach = { shoulder_lift: -0.4, elbow_flex: 0.7, wrist_flex: -0.3 };
    add(
      "reach",
      "手臂伸展",
      "Arm reach",
      "肩、肘、腕关节联动，不连接实体电机。",
      "Shoulder, elbow and wrist poses; no connection to physical motors.",
      [reach],
      5,
    );
    add(
      "gripper",
      "夹爪开合",
      "Open / close gripper",
      "夹爪角度变化；没有物体碰撞或抓取力求解。",
      "Gripper angle motion without object collision or grasp-force solving.",
      [{ ...reach, gripper: 1 }, reach, { ...reach, gripper: 1 }],
      5,
    );
  }
  if (robotId === "h1") {
    add(
      "arm-pose",
      "抬臂姿态",
      "Arm pose",
      "官方肩肘关节的固定基座插值；不是平衡或行走控制。",
      "Fixed-base shoulder and elbow interpolation, not balance or locomotion control.",
      [
        {
          right_shoulder_pitch_joint: -0.7,
          right_shoulder_roll_joint: -0.25,
          right_elbow_joint: 0.8,
        },
      ],
      5,
    );
    add(
      "torso-pose",
      "躯干转动",
      "Torso turn",
      "仅躯干关节姿态；不验证接触或动态稳定性。",
      "Torso joint poses only; contact and dynamic stability are not validated.",
      [{ torso_joint: -0.35 }, { torso_joint: 0.35 }],
      5,
    );
  } else if (robotId === "turtlebot3") {
    add(
      "wheel-pose",
      "双轮转动",
      "Wheel rotation",
      "原地观察官方双轮关节；不计算轮地摩擦、里程计或底盘位移。",
      "Observe source wheel joints in place; no wheel-ground friction, odometry or chassis displacement calculation.",
      [
        { wheel_left_joint: 2, wheel_right_joint: 2 },
        { wheel_left_joint: -2, wheel_right_joint: -2 },
      ],
      6,
    );
    add(
      "differential-pose",
      "差动轮姿态",
      "Opposed wheel poses",
      "两轮反向转动的教学示意；底盘固定，不是导航控制器。",
      "Illustrative opposite wheel rotations with a fixed chassis, not a navigation controller.",
      [
        { wheel_left_joint: 2, wheel_right_joint: -2 },
        { wheel_left_joint: -2, wheel_right_joint: 2 },
      ],
      6,
    );
  }
  for (const p of extraDirectPresets[robotId] || []) {
    if (
      !p.frames.every((frame) =>
        Object.keys(frame).every((name) => names.has(name)),
      )
    )
      continue;
    result.push({
      ...p,
      frames: p.frames.map((frame) => boundedPose(joints, frame)),
    });
  }
  if (robotId === "svh_hand") {
    const definition = svhHandDefinition;
    const drives = definition.joints.filter(
      (j) => !j.mimic && j.type !== "fixed",
    );
    // Fail closed on model changes: effective coupled limits belong to this exact source configuration.
    const compatible = drives.every((source) => {
      const actual = joints.find((j) => j.name === source.name);
      return (
        actual &&
        actual.type === source.type &&
        Math.abs(actual.lower - source.lower) < 1e-6 &&
        Math.abs(actual.upper - source.upper) < 1e-6
      );
    });
    if (compatible) {
      const open = handPreset(definition, "open");
      const push = (
        id: string,
        zh: string,
        en: string,
        frames: Record<string, number>[],
        duration: number,
      ) =>
        result.push({
          id,
          name: { zh, en },
          description: {
            zh: "使用SVH专属实验的有效耦合限位，仅输出9个独立驱动，11个从关节遵循源mimic。关节空间姿态示意，不代表抓取接触或成功。",
            en: "Uses the specialized SVH lab's effective coupled limits: nine independent drives with eleven source mimic followers. Joint-space poses, not contact or grasp success.",
          },
          frames: frames.map((frame) => boundedHandPose(definition, frame)),
          duration,
        });
      push(
        "svh-open-close",
        "五指缓慢开合",
        "Five-digit open / flex",
        [open, handPreset(definition, "fist"), open],
        8,
      );
      push(
        "svh-finger-sequence",
        "五指依次屈曲",
        "Sequential digit flexion",
        [
          open,
          ...definition.fingers.map((finger) =>
            setHandFingerCurl(definition, finger.id, 0.55, open),
          ),
          open,
        ],
        12,
      );
      push(
        "svh-opposition-preview",
        "拇指与食指姿态对照",
        "Thumb and index pose contrast",
        [open, handPreset(definition, "pinch"), open],
        8,
      );
    }
  }
  return result;
}
export function sampleDirectMotion(
  preset: DirectPreset,
  progress: number,
): Record<string, number> {
  const safe = Number.isFinite(progress)
    ? Math.max(0, Math.min(1, progress))
    : 0;
  if (safe === 0) return { ...preset.frames[0] };
  if (safe === 1) return { ...preset.frames[preset.frames.length - 1] };
  const position = safe * (preset.frames.length - 1);
  const start = Math.min(Math.floor(position), preset.frames.length - 2);
  const alpha = position - start;
  const smooth = alpha * alpha * (3 - 2 * alpha);
  const a = preset.frames[start],
    b = preset.frames[start + 1];
  return Object.fromEntries(
    Object.keys(a).map((name) => [
      name,
      a[name] + (b[name] - a[name]) * smooth,
    ]),
  );
}
