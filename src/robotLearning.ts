import type { LocalizedText } from "./learning";

export type RobotId = "g1" | "go2" | "panda" | "ur5e" | "fr3" | "so101";
export interface RobotLesson {
  id: string;
  robotId: RobotId;
  title: LocalizedText;
  summary: LocalizedText;
  body: LocalizedText;
  task: LocalizedText;
  sourceUrl: string;
  partIds: string[];
  jointIds: string[];
}
export interface ChainStep {
  id: string;
  title: LocalizedText;
  body: LocalizedText;
  partIds: string[];
  prerequisites: string[];
  sourceUrl: string;
}
export interface ChainExercise {
  robotId: RobotId;
  title: LocalizedText;
  disclaimer: LocalizedText;
  steps: ChainStep[];
}
const text = (zh: string, en: string): LocalizedText => ({ zh, en });
export const robotLearningSources: Record<RobotId, string> = {
  so101:
    "https://github.com/TheRobotStudio/SO-ARM100/blob/a758567c3978dfeefe282ede0500085a48fe8f78/Simulation/SO101/so101_new_calib.urdf",
  fr3: "https://github.com/frankarobotics/franka_description/blob/7aeeddc449edf8d62b594f9e36a81da53e7796f9/robots/fr3/fr3.urdf.xacro",
  g1: "https://github.com/unitreerobotics/unitree_ros/blob/725b59b6de39a26c425632120c89f23c49a36f1e/robots/g1_description/g1_23dof_mode_10.urdf",
  go2: "https://github.com/unitreerobotics/unitree_ros/blob/725b59b6de39a26c425632120c89f23c49a36f1e/robots/go2_description/urdf/go2_description.urdf",
  panda:
    "https://github.com/frankarobotics/franka_ros/blob/ddd2fffd9de44b02ad15b4bbb2bfa2cec4d60d98/franka_description/robots/panda/panda.urdf.xacro",
  ur5e: "https://github.com/UniversalRobots/Universal_Robots_ROS2_Description/blob/0eb1a861f7772fceb38510d90fa2f98ec668070c/urdf/ur.urdf.xacro",
};

export const robotLessons: RobotLesson[] = [
  {
    id: "so101-serial-chain",
    robotId: "so101",
    title: text("SO-101 · Follower 串联链", "SO-101 · Follower serial chain"),
    summary: text(
      "五个臂关节加一个旋转夹爪关节。",
      "Five arm joints plus a rotating gripper joint.",
    ),
    body: text(
      "从 base_link 出发，shoulder_pan、shoulder_lift、elbow_flex、wrist_flex 和 wrist_roll 依次连接肩、上臂、前臂、腕与夹爪装配体。夹爪的 gripper 关节再连接活动爪。这是 SO-101 follower 的 new calibration 模型，不是 leader 扳机配置。",
      "From base_link, shoulder_pan, shoulder_lift, elbow_flex, wrist_flex, and wrist_roll connect the shoulder, upper arm, lower arm, wrist, and gripper assemblies in sequence. The gripper joint then connects the moving jaw. This is the SO-101 follower new-calibration model, not a leader trigger configuration.",
    ),
    task: text(
      "分别调整肩部和腕部关节，观察不同范围的下游连杆。",
      "Adjust a shoulder joint and a wrist joint separately and observe the different downstream links.",
    ),
    sourceUrl: robotLearningSources.so101,
    partIds: [
      "base_link",
      "shoulder_link",
      "upper_arm_link",
      "lower_arm_link",
      "wrist_link",
      "gripper_link",
      "moving_jaw_so101_v1_link",
    ],
    jointIds: [
      "shoulder_pan",
      "shoulder_lift",
      "elbow_flex",
      "wrist_flex",
      "wrist_roll",
      "gripper",
    ],
  },
  {
    id: "so101-rotating-jaw",
    robotId: "so101",
    title: text(
      "SO-101 · 夹爪是转动，不是平移",
      "SO-101 · The jaw rotates, not slides",
    ),
    summary: text(
      "模型夹爪使用 revolute 和弧度。",
      "The model uses a revolute gripper joint in radians.",
    ),
    body: text(
      "gripper 将 gripper_link 连接到 moving_jaw_so101_v1_link，类型为 revolute。不要复制 Panda 或 FR3 的双指 prismatic/mimic 逻辑，也不要将外部系统的归一化开合数值直接当作弧度。这里只展示此模型的关节运动，不证明夹持力或实体接触。",
      "gripper connects gripper_link to moving_jaw_so101_v1_link as a revolute joint. Do not copy Panda or FR3 prismatic/mimic finger logic or treat another system's normalized opening values as radians. This shows model motion, not grasping force or physical contact validation.",
    ),
    task: text(
      "只调整 gripper，观察活动爪绕轴转动，其他臂关节保持不变。",
      "Adjust only gripper and observe the jaw rotating about its axis while the arm joints remain unchanged.",
    ),
    sourceUrl: robotLearningSources.so101,
    partIds: ["gripper_link", "moving_jaw_so101_v1_link"],
    jointIds: ["gripper"],
  },
  {
    id: "so101-reference-assembly",
    robotId: "so101",
    title: text(
      "SO-101 · 装配体与参考坐标系",
      "SO-101 · Assemblies and reference frames",
    ),
    summary: text(
      "一个 link 可以包含多个可见零件。",
      "One link can contain several visual parts.",
    ),
    body: text(
      "base_link 和 gripper_link 各自包含多个 visual 网格，因此 link 高亮不等于精确选中某颗螺钉。gripper_frame_link 则通过固定的 gripper_frame_joint 接到夹爪，没有独立驱动。物理装配阅读课使用官方文字提供的步骤，与这里的运动学连接树分开。",
      "base_link and gripper_link each contain multiple visual meshes, so highlighting a link does not precisely identify an individual screw. gripper_frame_link attaches to the gripper through fixed gripper_frame_joint and has no independent drive. The physical-assembly reading lesson uses official written procedures separately from this kinematic tree.",
    ),
    task: text(
      "对照夹爪装配体、活动爪与固定参考系，区分零件、关节和无网格坐标系。",
      "Compare the gripper assembly, moving jaw, and fixed reference frame; distinguish parts, joints, and a frame without a mesh.",
    ),
    sourceUrl: robotLearningSources.so101,
    partIds: [
      "base_link",
      "gripper_link",
      "moving_jaw_so101_v1_link",
      "gripper_frame_link",
    ],
    jointIds: ["gripper", "gripper_frame_joint"],
  },
  {
    id: "fr3-seven-axis",
    robotId: "fr3",
    title: text(
      "FR3 · 七轴链与配置专属限位",
      "FR3 · Seven axes and configuration-specific limits",
    ),
    summary: text(
      "读取 Arm3R 的真实连接，不沿用 Panda 的范围。",
      "Read the Arm3R connections without reusing Panda limits.",
    ),
    body: text(
      "当前 FR3 Arm3R 描述用 fr3_joint1 至 fr3_joint7 串联 fr3_link0 至 fr3_link7。第六轴范围为 0.4398 至 4.6216 rad，第四轴为 -3.077 至 -0.1169 rad，因此全零并不是合法初始姿态。这里是当前 fr3 配置，不是 Panda 或 fr3v2；数据也不能代替实机安全验证。",
      "This FR3 Arm3R description uses fr3_joint1 through fr3_joint7 to connect fr3_link0 through fr3_link7. Joint 6 ranges from 0.4398 to 4.6216 rad and joint 4 from -3.077 to -0.1169 rad, so an all-zero pose is not a valid initial pose. This is the current fr3 configuration, not Panda or fr3v2; its data does not replace hardware safety validation.",
    ),
    task: text(
      "查看第四、第六轴的限位，保持合法初始姿态，再小幅调整其中一个关节。",
      "Inspect the limits of joints 4 and 6, retain a valid initial pose, then adjust one joint slightly.",
    ),
    sourceUrl: robotLearningSources.fr3,
    partIds: [
      "fr3_link0",
      "fr3_link1",
      "fr3_link2",
      "fr3_link3",
      "fr3_link4",
      "fr3_link5",
      "fr3_link6",
      "fr3_link7",
    ],
    jointIds: [
      "fr3_joint1",
      "fr3_joint2",
      "fr3_joint3",
      "fr3_joint4",
      "fr3_joint5",
      "fr3_joint6",
      "fr3_joint7",
    ],
  },
  {
    id: "fr3-hand-frames",
    robotId: "fr3",
    title: text("FR3 · 法兰、手部与 TCP", "FR3 · Flange, hand, and TCP"),
    summary: text(
      "固定连接把白色 Franka Hand 接到 Arm3R 末端。",
      "Fixed connections attach the white Franka Hand to the Arm3R endpoint.",
    ),
    body: text(
      "fr3_joint8 将 fr3_link7 固定连接到 fr3_link8，fr3_hand_joint 再将手部连接到 link8。fr3_hand_tcp 由固定连接定义在手部之后，是工具参考坐标系，而不是另一台电机。这个练习仅说明所选 franka_hand 配置，不推断未知工具或内部电子。",
      "fr3_joint8 fixes fr3_link8 to fr3_link7, and fr3_hand_joint attaches the hand to link8. fr3_hand_tcp is then defined by a fixed hand-relative connection: it is a tool reference frame, not another motor. This exercise describes the selected franka_hand configuration only, without inferring unknown tools or internal electronics.",
    ),
    task: text(
      "选中手部，追踪 link7 → link8 → hand → hand_tcp；解释哪些是可见几何，哪些只是固定参考系。",
      "Select the hand and trace link7 → link8 → hand → hand_tcp; distinguish visible geometry from fixed reference frames.",
    ),
    sourceUrl: robotLearningSources.fr3,
    partIds: ["fr3_link7", "fr3_link8", "fr3_hand", "fr3_hand_tcp"],
    jointIds: ["fr3_joint8", "fr3_hand_joint", "fr3_hand_tcp_joint"],
  },
  {
    id: "fr3-finger-frames",
    robotId: "fr3",
    title: text(
      "FR3 · 相同局部轴，不同空间方向",
      "FR3 · Same local axis, different spatial directions",
    ),
    summary: text(
      "夹爪相向移动来自坐标变换与 mimic 关系。",
      "Opposing finger motion comes from frames and a mimic relationship.",
    ),
    body: text(
      "两指关节都是 prismatic，局部 axis 都写为 0 1 0；但第二个关节的 origin 绕 Z 轴旋转 π，因此在手部坐标系中的移动方向相反。第二指 mimic 第一指，范围均为 0 至 0.04 m。不能复制旧 Panda 文件里第二指的轴向文本，忽略此 FR3 配置的坐标变换。",
      "Both finger joints are prismatic and both local axes are written as 0 1 0. The second joint's origin is rotated by π about Z, so its translation direction in the hand frame is opposite. The second finger mimics the first, and both ranges are 0–0.04 m. Do not copy the second-finger axis text from the older Panda file while ignoring this FR3 configuration's frame transform.",
    ),
    task: text(
      "调整 fr3_finger_joint1，观察双指相向运动；对照第二指的 origin 与 axis，而不是只看 axis。",
      "Adjust fr3_finger_joint1 and observe opposing finger motion; inspect the second finger's origin together with its axis.",
    ),
    sourceUrl: robotLearningSources.fr3,
    partIds: ["fr3_hand", "fr3_leftfinger", "fr3_rightfinger"],
    jointIds: ["fr3_finger_joint1", "fr3_finger_joint2"],
  },
  {
    id: "g1-left-leg",
    robotId: "g1",
    title: text("G1 · 从骨盆到左脚", "G1 · From pelvis to left foot"),
    summary: text(
      "沿六个转动关节追踪一条腿。",
      "Trace one leg through six revolute joints.",
    ),
    body: text(
      "Mode 10 的左腿从 pelvis 出发，依次经过髋俯仰、髋侧摆、髋偏航、膝、踝俯仰与踝侧摆。每个关节连接前后两个连杆，上游运动会改变下游姿态。这是描述文件中的机构关系，不是电机内部结构或维修拆卸顺序。",
      "The Mode 10 left leg starts at pelvis and passes through hip pitch, hip roll, hip yaw, knee, ankle pitch, and ankle roll. Each joint connects consecutive links, so upstream motion changes downstream poses. This is the description's kinematic structure, not motor internals or a service removal sequence.",
    ),
    task: text(
      "先调整 left_hip_pitch_joint，再调整 left_knee_joint，比较两次运动影响的连杆范围。",
      "Adjust left_hip_pitch_joint, then left_knee_joint, and compare the affected downstream links.",
    ),
    sourceUrl: robotLearningSources.g1,
    partIds: [
      "pelvis",
      "left_hip_pitch_link",
      "left_hip_roll_link",
      "left_hip_yaw_link",
      "left_knee_link",
      "left_ankle_pitch_link",
      "left_ankle_roll_link",
    ],
    jointIds: [
      "left_hip_pitch_joint",
      "left_hip_roll_joint",
      "left_hip_yaw_joint",
      "left_knee_joint",
      "left_ankle_pitch_joint",
      "left_ankle_roll_joint",
    ],
  },
  {
    id: "g1-leg-pair",
    robotId: "g1",
    title: text("G1 · 双腿不是同一条链", "G1 · Two legs, two branches"),
    summary: text(
      "两条腿共享骨盆，但关节和实例独立。",
      "Both legs share a pelvis but have distinct joints and instances.",
    ),
    body: text(
      "左右髋俯仰关节都以 pelvis 为父连杆，之后各自形成一条腿链。名称中的 left 与 right 对应不同实例；不能把一个关节状态直接写入另一侧。两侧的局部关节范围和坐标也应分别读取。",
      "Both hip-pitch joints have pelvis as their parent, then form separate leg chains. The left and right names identify distinct instances; one joint state must not be written into the other by assumption. Read each side's local frames and ranges separately.",
    ),
    task: text(
      "分别选择左右髋侧摆关节，查看限位符号，再进行小幅单侧调整。",
      "Select the left and right hip-roll joints, compare the signs of their limits, then make a small one-sided adjustment.",
    ),
    sourceUrl: robotLearningSources.g1,
    partIds: [
      "pelvis",
      "left_hip_pitch_link",
      "left_hip_roll_link",
      "right_hip_pitch_link",
      "right_hip_roll_link",
    ],
    jointIds: [
      "left_hip_pitch_joint",
      "left_hip_roll_joint",
      "right_hip_pitch_joint",
      "right_hip_roll_joint",
    ],
  },
  {
    id: "g1-arm",
    robotId: "g1",
    title: text("G1 · 肩、肘与腕的传递", "G1 · Shoulder, elbow, and wrist"),
    summary: text(
      "观察 Mode 10 左臂的五关节链。",
      "Explore the five-joint left-arm chain in Mode 10.",
    ),
    body: text(
      "左臂从 torso_link 出发，经三个肩部关节、肘关节到腕滚转关节。末端是本配置的 left_wrist_roll_rubber_hand 连杆，不能把其他 G1 配置的多指手装配结论套到这里。腕部运动与整臂移动影响的范围不同。",
      "The left arm starts at torso_link and passes through three shoulder joints, the elbow, and wrist roll. Its endpoint is the configuration's left_wrist_roll_rubber_hand link; conclusions about articulated hands in other G1 variants do not apply here. Wrist motion and whole-arm motion affect different portions of the chain.",
    ),
    task: text(
      "依次操作肩俯仰、肘和腕滚转；指出每次移动的最下游连杆。",
      "Operate shoulder pitch, elbow, and wrist roll in turn; identify the downstream endpoint that moves each time.",
    ),
    sourceUrl: robotLearningSources.g1,
    partIds: [
      "torso_link",
      "left_shoulder_pitch_link",
      "left_shoulder_roll_link",
      "left_shoulder_yaw_link",
      "left_elbow_link",
      "left_wrist_roll_rubber_hand",
    ],
    jointIds: [
      "left_shoulder_pitch_joint",
      "left_shoulder_roll_joint",
      "left_shoulder_yaw_joint",
      "left_elbow_joint",
      "left_wrist_roll_joint",
    ],
  },
  {
    id: "g1-waist-fixed-head",
    robotId: "g1",
    title: text(
      "G1 · 腰部运动与固定头部",
      "G1 · Moving waist, fixed head attachment",
    ),
    summary: text(
      "一个可动连接与一个固定连接的区别。",
      "Contrast a moving connection with a fixed attachment.",
    ),
    body: text(
      "waist_yaw_joint 将 pelvis 连接到 torso_link，是转动关节；head_joint 将 torso_link 连接到 head_link，是固定关节。头部会随躯干移动，但这不代表本配置有独立颈关节。不要把其他代际的头部自由度移植到 Mode 10。",
      "waist_yaw_joint connects pelvis to torso_link as a revolute joint; head_joint connects torso_link to head_link as a fixed joint. The head follows the torso, but this does not establish an independent neck joint in this configuration. Do not import head DOFs from another generation into Mode 10.",
    ),
    task: text(
      "小幅转动腰部，观察头部随动；在来源中对比两个关节的 type。",
      "Rotate the waist slightly and observe the head following it; compare the two joint types in the source.",
    ),
    sourceUrl: robotLearningSources.g1,
    partIds: ["pelvis", "torso_link", "head_link"],
    jointIds: ["waist_yaw_joint", "head_joint"],
  },
  {
    id: "go2-front-leg",
    robotId: "go2",
    title: text("Go2 · 三关节前腿", "Go2 · A three-joint front leg"),
    summary: text(
      "从躯干经髋、大腿、小腿到足端。",
      "Follow the base, hip, thigh, calf, and foot.",
    ),
    body: text(
      "左前腿主链为 base → FL_hip → FL_thigh → FL_calf → FL_foot。前三个连接是转动关节，足端连接 FL_foot_joint 是固定关节。脚随小腿运动，不应额外增加一个自由转动的踝关节。",
      "The front-left main chain is base → FL_hip → FL_thigh → FL_calf → FL_foot. The first three connections are revolute; FL_foot_joint is fixed. The foot follows the calf and must not be given an extra freely rotating ankle joint.",
    ),
    task: text(
      "分别移动 FL_hip_joint、FL_thigh_joint 和 FL_calf_joint，比较三个运动方向。",
      "Move FL_hip_joint, FL_thigh_joint, and FL_calf_joint separately and compare their directions.",
    ),
    sourceUrl: robotLearningSources.go2,
    partIds: ["base", "FL_hip", "FL_thigh", "FL_calf", "FL_foot"],
    jointIds: [
      "FL_hip_joint",
      "FL_thigh_joint",
      "FL_calf_joint",
      "FL_foot_joint",
    ],
  },
  {
    id: "go2-four-branches",
    robotId: "go2",
    title: text(
      "Go2 · 四条腿共享一个躯干",
      "Go2 · Four branches from one base",
    ),
    summary: text(
      "用前后左右的前缀找到独立运动链。",
      "Identify separate chains by their front/rear and left/right prefixes.",
    ),
    body: text(
      "FL、FR、RL、RR 对应左前、右前、左后、右后的腿分支，四个 hip_joint 的父连杆均为 base。相似的结构命名不代表关节范围、方向或状态可以无条件互换。静态四足姿态也不能证明动态稳定性。",
      "FL, FR, RL, and RR identify front-left, front-right, rear-left, and rear-right branches. All four hip joints have base as their parent. Similar naming does not make limits, directions, or states interchangeable. A static quadruped pose also does not establish dynamic stability.",
    ),
    task: text(
      "选中四个髋连杆的位置，只操作其中一条腿，确认其他腿不会被错误复用状态。",
      "Locate the four hip links, operate one leg only, and verify that the other legs do not inherit its state accidentally.",
    ),
    sourceUrl: robotLearningSources.go2,
    partIds: ["base", "FL_hip", "FR_hip", "RL_hip", "RR_hip"],
    jointIds: ["FL_hip_joint", "FR_hip_joint", "RL_hip_joint", "RR_hip_joint"],
  },
  {
    id: "go2-front-rear-limits",
    robotId: "go2",
    title: text(
      "Go2 · 前后腿限位要分别读",
      "Go2 · Read front and rear limits separately",
    ),
    summary: text(
      "同名结构不意味着相同角度范围。",
      "Similar structures need not have identical angular ranges.",
    ),
    body: text(
      "所加载描述里，FL_thigh_joint 的范围为 -1.5708 至 3.4907 rad，RL_thigh_joint 为 -0.5236 至 4.5379 rad。它们都连接 hip 到 thigh，但范围并不相同。这里引用的是此版本模型限位，不是额外核验过的实机安全范围。",
      "In this loaded description, FL_thigh_joint ranges from -1.5708 to 3.4907 rad, while RL_thigh_joint ranges from -0.5236 to 4.5379 rad. Both connect a hip to a thigh, but their ranges differ. These are this model revision's limits, not independently verified hardware safety limits.",
    ),
    task: text(
      "对比前后大腿关节的上下限，不把前腿的最大值复制到后腿。",
      "Compare the front and rear thigh limits instead of copying the front-leg maximum into the rear leg.",
    ),
    sourceUrl: robotLearningSources.go2,
    partIds: ["FL_hip", "FL_thigh", "RL_hip", "RL_thigh"],
    jointIds: ["FL_thigh_joint", "RL_thigh_joint"],
  },
  {
    id: "go2-fixed-foot",
    robotId: "go2",
    title: text("Go2 · 足端与附属连杆", "Go2 · Foot and auxiliary links"),
    summary: text(
      "树上存在一个节点，不等于新增自由度。",
      "A node in the tree is not necessarily another DOF.",
    ),
    body: text(
      "FL_foot、FL_calflower 和 FL_calflower1 都通过固定连接挂接在左前小腿分支。模型可以用多个连杆表达几何或其他描述用途，它们不都对应独立驱动关节。不能仅凭这些节点名称推断其内部材料、传动件或维修用途。",
      "FL_foot, FL_calflower, and FL_calflower1 attach through fixed connections within the front-left calf branch. Multiple links can serve geometric or other description purposes without independent drives. Their names alone do not establish internal materials, transmission components, or service roles.",
    ),
    task: text(
      "观察三个固定连接，在小腿关节变化时确认这些节点随同运动。",
      "Inspect the three fixed connections and observe these nodes following the calf when its joint changes.",
    ),
    sourceUrl: robotLearningSources.go2,
    partIds: ["FL_calf", "FL_foot", "FL_calflower", "FL_calflower1"],
    jointIds: [
      "FL_calf_joint",
      "FL_foot_joint",
      "FL_calflower_joint",
      "FL_calflower1_joint",
    ],
  },
  {
    id: "panda-seven-axis",
    robotId: "panda",
    title: text("Panda · 七轴串联链", "Panda · Seven-axis serial chain"),
    summary: text(
      "沿 link0 到 link7 观察连续连接。",
      "Follow consecutive connections from link0 to link7.",
    ),
    body: text(
      "panda_joint1 至 panda_joint7 都是转动关节，依次连接 panda_link0 至 panda_link7。七个转动轴属于此 Panda 模型，不代表 FR3 或其他配置。这里的滑条做正向运动学观察，没有承诺自动保持末端姿态的逆运动学求解。",
      "panda_joint1 through panda_joint7 are revolute joints connecting panda_link0 through panda_link7 in sequence. These seven axes belong to this Panda model, not an FR3 or another configuration. The sliders support forward-kinematic observation; they do not promise inverse kinematics that automatically preserves the end-effector pose.",
    ),
    task: text(
      "先改变 joint2，再改变 joint6，比较整个臂链和靠近末端部分的变化。",
      "Change joint2, then joint6, and compare the effect on the arm chain versus the links near its endpoint.",
    ),
    sourceUrl: robotLearningSources.panda,
    partIds: [
      "panda_link0",
      "panda_link1",
      "panda_link2",
      "panda_link3",
      "panda_link4",
      "panda_link5",
      "panda_link6",
      "panda_link7",
    ],
    jointIds: [
      "panda_joint1",
      "panda_joint2",
      "panda_joint3",
      "panda_joint4",
      "panda_joint5",
      "panda_joint6",
      "panda_joint7",
    ],
  },
  {
    id: "panda-gripper",
    robotId: "panda",
    title: text("Panda · 双指的耦合移动", "Panda · Coupled finger translation"),
    summary: text(
      "两个移动关节，一个 mimic 关系。",
      "Two prismatic joints and one mimic relationship.",
    ),
    body: text(
      "两个手指都以 panda_hand 为父连杆。finger_joint1 与 finger_joint2 的轴分别是局部 +Y 和 -Y，范围均为 0 至 0.04 m；第二个关节 mimic 第一个。两指的联动来自明确关系，不应把它们算成两路独立控制输入。",
      "Both fingers have panda_hand as their parent. finger_joint1 and finger_joint2 use local +Y and -Y axes, each with a 0–0.04 m range; the second mimics the first. Their coupling is explicitly described and should not be counted as two independent control inputs.",
    ),
    task: text(
      "调整 panda_finger_joint1，观察双指沿相反方向移动；注意单位是米，不是角度。",
      "Adjust panda_finger_joint1 and observe both fingers translating in opposite directions; the unit is metres, not degrees.",
    ),
    sourceUrl: robotLearningSources.panda,
    partIds: ["panda_hand", "panda_leftfinger", "panda_rightfinger"],
    jointIds: ["panda_finger_joint1", "panda_finger_joint2"],
  },
  {
    id: "panda-tool-frame",
    robotId: "panda",
    title: text("Panda · 手部与工具坐标系", "Panda · Hand and tool frame"),
    summary: text(
      "区分可见连杆与固定参考坐标系。",
      "Distinguish visible links from fixed reference frames.",
    ),
    body: text(
      "panda_link7 经固定的 panda_joint8 到 panda_link8，再由 panda_hand_joint 接到手部。panda_hand_tcp 也是通过固定连接定义的末端参考坐标系，不是新增电机。参考坐标系即使没有可见网格，仍对定位有意义。",
      "panda_link7 connects through fixed panda_joint8 to panda_link8, then through panda_hand_joint to the hand. panda_hand_tcp is also defined by a fixed connection as a tool reference frame, not another motor. A reference frame can matter for positioning even without a visible mesh.",
    ),
    task: text(
      "选中手部，对照来源中的 link7 → link8 → hand → hand_tcp；不要为固定连接添加独立运动。",
      "Select the hand and trace link7 → link8 → hand → hand_tcp in the source; do not add independent motion to fixed connections.",
    ),
    sourceUrl: robotLearningSources.panda,
    partIds: ["panda_link7", "panda_link8", "panda_hand", "panda_hand_tcp"],
    jointIds: ["panda_joint8", "panda_hand_joint", "panda_hand_tcp_joint"],
  },
  {
    id: "ur5e-shoulder-elbow",
    robotId: "ur5e",
    title: text("UR5e · 肩部到前臂", "UR5e · Shoulder to forearm"),
    summary: text(
      "前三个转动关节连接基座与前臂。",
      "The first three revolute joints connect base to forearm.",
    ),
    body: text(
      "主链从 base_link_inertia 经 shoulder_pan_joint 到 shoulder_link，再经 shoulder_lift_joint 到 upper_arm_link，随后经 elbow_joint 到 forearm_link。各轴在各自局部坐标系里定义，不能因 axis 文本相同就认为世界坐标方向相同。",
      "The main chain runs from base_link_inertia through shoulder_pan_joint to shoulder_link, then through shoulder_lift_joint to upper_arm_link and elbow_joint to forearm_link. Each axis is expressed in its own local frame; identical axis text does not imply an identical world-space direction.",
    ),
    task: text(
      "分别操作 shoulder_pan_joint 与 shoulder_lift_joint，比较绕基座转动和抬臂的方向。",
      "Operate shoulder_pan_joint and shoulder_lift_joint separately and compare their directions.",
    ),
    sourceUrl: robotLearningSources.ur5e,
    partIds: [
      "base_link_inertia",
      "shoulder_link",
      "upper_arm_link",
      "forearm_link",
    ],
    jointIds: ["shoulder_pan_joint", "shoulder_lift_joint", "elbow_joint"],
  },
  {
    id: "ur5e-wrist",
    robotId: "ur5e",
    title: text("UR5e · 三段腕部链", "UR5e · Three wrist stages"),
    summary: text(
      "沿 wrist_1、wrist_2、wrist_3 观察末端姿态。",
      "Observe endpoint orientation through wrist_1, wrist_2, and wrist_3.",
    ),
    body: text(
      "forearm_link 后依次是 wrist_1_link、wrist_2_link 与 wrist_3_link，每段都有对应转动关节。上游腕关节会带动后续腕部和工具坐标系。该模型是官方名义参数配置，不代表某台实机的专属标定。",
      "After forearm_link come wrist_1_link, wrist_2_link, and wrist_3_link, each with a revolute joint. An upstream wrist joint carries subsequent wrist links and tool frames. This model uses official nominal parameters, not calibration for a particular physical unit.",
    ),
    task: text(
      "保持前三轴不变，分别调整三个腕关节，观察末端方向的变化。",
      "Keep the first three axes unchanged and adjust the wrist joints separately to observe endpoint orientation.",
    ),
    sourceUrl: robotLearningSources.ur5e,
    partIds: ["forearm_link", "wrist_1_link", "wrist_2_link", "wrist_3_link"],
    jointIds: ["wrist_1_joint", "wrist_2_joint", "wrist_3_joint"],
  },
  {
    id: "ur5e-tool-frames",
    robotId: "ur5e",
    title: text("UR5e · 法兰不是夹爪", "UR5e · A flange is not a gripper"),
    summary: text(
      "固定末端坐标系不增加驱动轴。",
      "Fixed endpoint frames add no driven axes.",
    ),
    body: text(
      "wrist_3_link 通过固定连接挂接 flange 和 ft_frame；tool0 再通过固定连接位于 flange 之后。这些参考系不能被当成额外电机或已经安装的夹爪。当前模型没有交付一个可凭空抓取物体的末端执行器。",
      "wrist_3_link has fixed connections to flange and ft_frame; tool0 follows flange through another fixed connection. These frames are not additional motors or evidence of an installed gripper. This model does not supply an end effector that can simply grasp objects.",
    ),
    task: text(
      "查看 flange 与 tool0 的固定关系，解释为何它们不增加 UR5e 的六轴计数。",
      "Inspect the fixed flange-to-tool0 relationship and explain why these frames do not add to the UR5e's six axes.",
    ),
    sourceUrl: robotLearningSources.ur5e,
    partIds: ["wrist_3_link", "flange", "tool0", "ft_frame"],
    jointIds: ["wrist_3-flange", "flange-tool0", "wrist_3_link-ft_frame"],
  },
];

const disclaimer = text(
  "运动链组装是按 URDF 父子关系进行的教学重建，不是真机维修装配。步骤不提供螺钉、扭矩、布线或安全拆卸指导。",
  "Kinematic-chain assembly is a teaching reconstruction of URDF parent-child relationships, not physical service assembly. It provides no screw, torque, wiring, or safe disassembly instructions.",
);
type StepInput = {
  title: LocalizedText;
  body: LocalizedText;
  partIds: string[];
};
function exercise(
  robotId: RobotId,
  title: LocalizedText,
  inputs: StepInput[],
): ChainExercise {
  return {
    robotId,
    title,
    disclaimer,
    steps: inputs.map((step, index) => ({
      ...step,
      id: `${robotId}-chain-${index + 1}`,
      prerequisites: index ? [`${robotId}-chain-${index}`] : [],
      sourceUrl: robotLearningSources[robotId],
    })),
  };
}
export const chainExercises: ChainExercise[] = [
  exercise(
    "so101",
    text("SO-101 · Follower 运动链", "SO-101 · Follower kinematic chain"),
    [
      {
        title: text("基座参考", "Base reference"),
        body: text(
          "base_link 是此链的起点，不代表底座螺钉已装好。",
          "base_link starts this chain; this does not mean physical base screws have been installed.",
        ),
        partIds: ["base_link"],
      },
      {
        title: text("肩部偏航", "Shoulder pan"),
        body: text(
          "shoulder_pan 将基座连接到 shoulder_link。",
          "shoulder_pan connects the base to shoulder_link.",
        ),
        partIds: ["shoulder_link"],
      },
      {
        title: text("肩部抬升与上臂", "Shoulder lift and upper arm"),
        body: text(
          "shoulder_lift 连接 upper_arm_link。",
          "shoulder_lift connects upper_arm_link.",
        ),
        partIds: ["upper_arm_link"],
      },
      {
        title: text("肘部与前臂", "Elbow and lower arm"),
        body: text(
          "elbow_flex 将上臂连接到 lower_arm_link。",
          "elbow_flex connects the upper arm to lower_arm_link.",
        ),
        partIds: ["lower_arm_link"],
      },
      {
        title: text("腕部俯仰", "Wrist flex"),
        body: text(
          "wrist_flex 将前臂接到 wrist_link。",
          "wrist_flex connects the lower arm to wrist_link.",
        ),
        partIds: ["wrist_link"],
      },
      {
        title: text("腕滚转与夹爪装配体", "Wrist roll and gripper assembly"),
        body: text(
          "wrist_roll 接入 gripper_link，固定连接定义 gripper_frame_link。",
          "wrist_roll adds gripper_link; a fixed connection defines gripper_frame_link.",
        ),
        partIds: ["gripper_link", "gripper_frame_link"],
      },
      {
        title: text("旋转活动爪", "Rotating jaw"),
        body: text(
          "gripper 以转动关节连接活动爪；没有双指 mimic。",
          "gripper connects the moving jaw with a revolute joint; there is no two-finger mimic relationship.",
        ),
        partIds: ["moving_jaw_so101_v1_link"],
      },
    ],
  ),
  exercise(
    "fr3",
    text("FR3 · 重建 Arm3R 与手部链", "FR3 · Rebuild the Arm3R and hand chain"),
    [
      {
        title: text("建立基座参考", "Establish the base reference"),
        body: text(
          "base 通过固定的 fr3_base_joint 接到 fr3_link0。",
          "base connects to fr3_link0 through fixed fr3_base_joint.",
        ),
        partIds: ["fr3_link0", "base"],
      },
      {
        title: text("接入第一、二轴", "Connect axes one and two"),
        body: text(
          "fr3_joint1 和 fr3_joint2 依次接入 link1、link2。",
          "fr3_joint1 and fr3_joint2 add link1 and link2 in sequence.",
        ),
        partIds: ["fr3_link1", "fr3_link2"],
      },
      {
        title: text("延伸至第四轴", "Extend through axis four"),
        body: text(
          "沿父子链接入 link3、link4；第四轴不能采用零位。",
          "Continue along the parent-child chain through link3 and link4; joint 4 cannot use zero position.",
        ),
        partIds: ["fr3_link3", "fr3_link4"],
      },
      {
        title: text("加入第五、六轴", "Add axes five and six"),
        body: text(
          "接入 link5、link6，并保留 FR3 第六轴的专属限位。",
          "Add link5 and link6 while retaining the FR3-specific joint-6 limits.",
        ),
        partIds: ["fr3_link5", "fr3_link6"],
      },
      {
        title: text(
          "完成七轴臂与法兰参考",
          "Complete the arm and flange reference",
        ),
        body: text(
          "joint7 接入 link7；固定的 joint8 接入 link8。",
          "joint7 connects link7; fixed joint8 adds link8.",
        ),
        partIds: ["fr3_link7", "fr3_link8"],
      },
      {
        title: text("连接手部与工具参考系", "Connect the hand and tool frame"),
        body: text(
          "手部与 TCP 均使用已描述的固定连接，不增加驱动轴。",
          "The hand and TCP use their described fixed connections and add no driven axes.",
        ),
        partIds: ["fr3_hand", "fr3_hand_tcp"],
      },
      {
        title: text("接入耦合双指", "Connect the coupled fingers"),
        body: text(
          "两指从 hand 分支，第二指用旋转后的局部坐标系并 mimic 第一指。",
          "Both fingers branch from hand; the second uses a rotated local frame and mimics the first.",
        ),
        partIds: ["fr3_leftfinger", "fr3_rightfinger"],
      },
    ],
  ),
  exercise(
    "g1",
    text("G1 · 重建左腿运动链", "G1 · Rebuild the left-leg chain"),
    [
      {
        title: text("定位骨盆", "Locate the pelvis"),
        body: text(
          "pelvis 是这条腿链的起点。先建立参考，不猜测内部器件。",
          "pelvis is the root of this leg chain. Establish the reference without inventing internal components.",
        ),
        partIds: ["pelvis"],
      },
      {
        title: text("加入髋俯仰连杆", "Add the hip-pitch link"),
        body: text(
          "由 left_hip_pitch_joint 连接 pelvis 与 left_hip_pitch_link。",
          "left_hip_pitch_joint connects pelvis to left_hip_pitch_link.",
        ),
        partIds: ["left_hip_pitch_link"],
      },
      {
        title: text("连接髋侧摆与偏航", "Connect hip roll and yaw"),
        body: text(
          "沿父子树接入 left_hip_roll_link，再接 left_hip_yaw_link。",
          "Follow the parent-child tree through left_hip_roll_link and then left_hip_yaw_link.",
        ),
        partIds: ["left_hip_roll_link", "left_hip_yaw_link"],
      },
      {
        title: text("接入膝连杆", "Connect the knee link"),
        body: text(
          "left_knee_joint 将髋偏航连杆连接到 left_knee_link。",
          "left_knee_joint connects the hip-yaw link to left_knee_link.",
        ),
        partIds: ["left_knee_link"],
      },
      {
        title: text("完成踝部链", "Complete the ankle chain"),
        body: text(
          "依次加入 left_ankle_pitch_link 和 left_ankle_roll_link，得到六轴腿链。",
          "Add left_ankle_pitch_link and then left_ankle_roll_link to complete the six-axis leg chain.",
        ),
        partIds: ["left_ankle_pitch_link", "left_ankle_roll_link"],
      },
    ],
  ),
  exercise(
    "go2",
    text("Go2 · 重建左前腿运动链", "Go2 · Rebuild the front-left leg chain"),
    [
      {
        title: text("定位躯干基座", "Locate the base"),
        body: text(
          "base 是左前腿的共同上游参考。",
          "base is the upstream reference for the front-left leg.",
        ),
        partIds: ["base"],
      },
      {
        title: text("接入髋连杆", "Connect the hip"),
        body: text(
          "FL_hip_joint 将 base 连接到 FL_hip。",
          "FL_hip_joint connects base to FL_hip.",
        ),
        partIds: ["FL_hip"],
      },
      {
        title: text("接入大腿连杆", "Connect the thigh"),
        body: text(
          "FL_thigh_joint 将 FL_hip 连接到 FL_thigh。",
          "FL_thigh_joint connects FL_hip to FL_thigh.",
        ),
        partIds: ["FL_thigh"],
      },
      {
        title: text("接入小腿连杆", "Connect the calf"),
        body: text(
          "FL_calf_joint 将 FL_thigh 连接到 FL_calf。",
          "FL_calf_joint connects FL_thigh to FL_calf.",
        ),
        partIds: ["FL_calf"],
      },
      {
        title: text("加入固定足端", "Add the fixed foot"),
        body: text(
          "FL_foot_joint 是固定连接，足端不是第四个可动关节。",
          "FL_foot_joint is fixed; the foot is not a fourth moving joint.",
        ),
        partIds: ["FL_foot"],
      },
    ],
  ),
  exercise(
    "panda",
    text("Panda · 从基座到双指", "Panda · From base to fingers"),
    [
      {
        title: text("定位 link0", "Locate link0"),
        body: text(
          "panda_link0 是主臂串联链的起点。",
          "panda_link0 is the root of the main arm chain.",
        ),
        partIds: ["panda_link0"],
      },
      {
        title: text("接入第一、二轴", "Connect axes one and two"),
        body: text(
          "依次连接 panda_link1 与 panda_link2。",
          "Connect panda_link1 and then panda_link2.",
        ),
        partIds: ["panda_link1", "panda_link2"],
      },
      {
        title: text("延伸至第四轴", "Extend through axis four"),
        body: text(
          "由 joint3 和 joint4 依次接入 link3、link4。",
          "Use joint3 and joint4 to continue through link3 and link4.",
        ),
        partIds: ["panda_link3", "panda_link4"],
      },
      {
        title: text("接入第五、六轴", "Connect axes five and six"),
        body: text(
          "沿连续父子关系加入 link5 与 link6。",
          "Add link5 and link6 along their consecutive parent-child relationships.",
        ),
        partIds: ["panda_link5", "panda_link6"],
      },
      {
        title: text("完成臂链末段", "Complete the arm chain"),
        body: text(
          "joint7 接入 link7；固定的 joint8 接入 link8。",
          "joint7 connects link7; fixed joint8 adds link8.",
        ),
        partIds: ["panda_link7", "panda_link8"],
      },
      {
        title: text("加入手部", "Add the hand"),
        body: text(
          "panda_hand_joint 以固定关系把手部接到 link8。",
          "panda_hand_joint fixes the hand to link8.",
        ),
        partIds: ["panda_hand"],
      },
      {
        title: text("建立双指分支", "Build the two finger branches"),
        body: text(
          "两个手指都从 hand 分支；第二个移动关节跟随第一个。",
          "Both fingers branch from hand; the second prismatic joint mimics the first.",
        ),
        partIds: ["panda_leftfinger", "panda_rightfinger"],
      },
    ],
  ),
  exercise(
    "ur5e",
    text("UR5e · 从基座到工具参考系", "UR5e · From base to tool frame"),
    [
      {
        title: text("建立基座参考", "Establish the base reference"),
        body: text(
          "world、base_link 和 base_link_inertia 通过固定连接定义基座参考。",
          "world, base_link, and base_link_inertia define the base reference through fixed connections.",
        ),
        partIds: ["base_link", "base_link_inertia", "world"],
      },
      {
        title: text("接入肩部", "Connect the shoulder"),
        body: text(
          "shoulder_pan_joint 将惯性基座参考连到 shoulder_link。",
          "shoulder_pan_joint connects the inertial base reference to shoulder_link.",
        ),
        partIds: ["shoulder_link"],
      },
      {
        title: text("加入上臂", "Add the upper arm"),
        body: text(
          "shoulder_lift_joint 将 shoulder_link 接到 upper_arm_link。",
          "shoulder_lift_joint connects shoulder_link to upper_arm_link.",
        ),
        partIds: ["upper_arm_link"],
      },
      {
        title: text("加入前臂", "Add the forearm"),
        body: text(
          "elbow_joint 将 upper_arm_link 接到 forearm_link。",
          "elbow_joint connects upper_arm_link to forearm_link.",
        ),
        partIds: ["forearm_link"],
      },
      {
        title: text("接入第一腕段", "Connect the first wrist stage"),
        body: text(
          "wrist_1_joint 把 forearm_link 接到 wrist_1_link。",
          "wrist_1_joint connects forearm_link to wrist_1_link.",
        ),
        partIds: ["wrist_1_link"],
      },
      {
        title: text("接入第二腕段", "Connect the second wrist stage"),
        body: text(
          "wrist_2_joint 将 wrist_1_link 接到 wrist_2_link。",
          "wrist_2_joint connects wrist_1_link to wrist_2_link.",
        ),
        partIds: ["wrist_2_link"],
      },
      {
        title: text("完成末端参考", "Complete the endpoint reference"),
        body: text(
          "接入 wrist_3_link，再沿固定连接到 flange 和 tool0；这里没有假设夹爪。",
          "Add wrist_3_link, then follow fixed connections to flange and tool0; no gripper is assumed.",
        ),
        partIds: ["wrist_3_link", "flange", "tool0"],
      },
    ],
  ),
];
