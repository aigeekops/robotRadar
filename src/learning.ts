/** Bilingual, source-linked lessons. No lesson asserts unverified robot internals. */
export type LocalizedText = { zh: string; en: string };
export interface Lesson {
  id: string;
  title: LocalizedText;
  summary: LocalizedText;
  body: LocalizedText;
  task: LocalizedText;
  sourceUrl: string;
}
export interface Question {
  id: string;
  prompt: LocalizedText;
  options: LocalizedText[];
  answer: number;
  explanation: LocalizedText;
  sourceUrl: string;
}

const jointSource =
  "https://github.com/ros/urdfdom_headers/blob/master/include/urdf_model/joint.h";
const linkSource =
  "https://github.com/ros/urdfdom_headers/blob/master/include/urdf_model/link.h";
const unitreeSource =
  "https://github.com/unitreerobotics/unitree_ros/tree/master/robots";
const simulationSource = "https://github.com/unitreerobotics/unitree_mujoco";

export const lessons: Lesson[] = [
  {
    id: "links-and-joints",
    title: {
      zh: "01 · 从一条运动链开始",
      en: "01 · Start with a kinematic chain",
    },
    summary: {
      zh: "连杆是结构，关节描述它们如何连接和运动。",
      en: "Links describe bodies; joints describe their connections and motion.",
    },
    body: {
      zh: "URDF 用 link 表达刚体，用 joint 连接父连杆与子连杆。关节的 origin 给出父连杆坐标系到关节坐标系的变换；axis 给出旋转轴或移动方向。移动一个上游关节时，下游连杆会一起运动。因此，零件列表不是一堆彼此独立的模型，而是一棵有方向的连接树。这里的 link 可能是一整个装配件，不等于实际可拆下的一颗螺钉或一个电机。",
      en: "URDF represents rigid bodies with links and connects a parent link to a child link with a joint. The joint origin describes the transform from the parent frame to the joint frame; its axis defines a rotation axis or translation direction. Moving an upstream joint carries downstream links with it. A model is therefore a directed connection tree, not a collection of independent shapes. A link may represent an assembly rather than a separately removable motor or screw.",
    },
    task: {
      zh: "选择一个可动关节，缓慢调整角度。观察哪些下游连杆随之移动，再换一个更靠近末端的关节比较。",
      en: "Choose a movable joint and adjust it slowly. Observe which downstream links move, then compare with a joint closer to the end of the chain.",
    },
    sourceUrl: jointSource,
  },
  {
    id: "degrees-of-freedom",
    title: {
      zh: "02 · 关节数不等于自由度",
      en: "02 · Joint count is not DOF count",
    },
    summary: {
      zh: "固定、转动、移动和耦合关节需要分开理解。",
      en: "Distinguish fixed, rotating, sliding, and coupled joints.",
    },
    body: {
      zh: "固定关节不增加运动自由度；revolute 绕轴转动且有位置限位；continuous 可连续旋转；prismatic 沿轴移动。mimic 关系把一个关节的位置关联到另一个关节，不应把它当成可独立控制的输入。模型中的可动关节数量也不能直接证明真机拥有同样数量的独立驱动器：还需要具体硬件配置和控制接口证据。",
      en: "A fixed joint adds no motion DOF. A revolute joint rotates with position limits; a continuous joint can rotate continuously; a prismatic joint translates along an axis. A mimic relationship derives one joint position from another, so it is not an independent input. The number of movable joints in a model does not prove the number of independent hardware actuators: that requires evidence for the specific hardware and control interface.",
    },
    task: {
      zh: "在当前模型里对比一个固定关节与一个可动关节。查看类型和限位，不把列表总数写成产品自由度。",
      en: "Compare a fixed joint and a movable joint in the current model. Inspect their types and limits rather than reporting the list length as the product DOF.",
    },
    sourceUrl: jointSource,
  },
  {
    id: "three-model-layers",
    title: {
      zh: "03 · 看起来相同，职责不同",
      en: "03 · Three descriptions, three jobs",
    },
    summary: {
      zh: "外观、碰撞与惯性数据服务于不同问题。",
      en: "Visual, collision, and inertial data answer different questions.",
    },
    body: {
      zh: "visual 决定展示几何与材质；collision 用于接触与碰撞计算，常采用简化几何；inertial 描述质量、质心坐标和惯性张量。这三类信息可以有不同的原点与几何形状。漂亮的外观模型不自动具备可信动力学；碰撞体也不是隐藏在外壳里的真实部件。页面仅显示可视模型时，不能据此声称已经模拟重力、力矩或真实接触。",
      en: "Visual data describes rendered geometry and material. Collision data supports contact calculations and often uses simplified shapes. Inertial data describes mass, a center-of-mass frame, and the inertia tensor. These descriptions may use different origins and geometry. An attractive visual mesh does not automatically provide trustworthy dynamics, and a collision shape is not a physical component hidden inside the shell. Rendering alone does not establish gravity, torque, or contact simulation.",
    },
    task: {
      zh: "打开来源文件，分别搜索 visual、collision 和 inertial。记录三者是否都有定义，而不是凭外观推断。",
      en: "Open the source file and search for visual, collision, and inertial. Record whether each is defined instead of inferring it from the rendered appearance.",
    },
    sourceUrl: linkSource,
  },
  {
    id: "axes-and-limits",
    title: {
      zh: "04 · 让关节沿正确方向运动",
      en: "04 · Move along the correct axis",
    },
    summary: {
      zh: "轴线、原点、单位和限位共同定义运动。",
      en: "Axis, origin, units, and limits define the motion together.",
    },
    body: {
      zh: "关节变换必须在其自身坐标系中解释，不能把所有转轴都当作世界坐标的竖直方向。转动关节的位置通常以弧度表达，界面可以换算成角度显示；移动关节用长度单位，不能套用角度。位置限位只是模型约束，不能保证该姿态没有自碰撞、失去平衡或超过电机能力。浏览器关节实验也不是实机安全操作指导。",
      en: "Joint transforms are interpreted in their own frames; not every rotation axis points upward in world coordinates. Rotational positions are conventionally expressed in radians, even when a UI displays degrees. Prismatic joints use length units, not angles. Position limits alone do not guarantee a collision-free, balanced, or actuator-feasible pose. A browser joint experiment is not a real-hardware safety procedure.",
    },
    task: {
      zh: "让一个关节从中间位置缓慢移动到上下限，观察真实轴向。复位后再做下一个实验，不强行超出范围。",
      en: "Move a joint slowly from its middle position toward both limits and observe its axis. Reset before the next experiment; do not force values outside the range.",
    },
    sourceUrl: jointSource,
  },
  {
    id: "robot-morphologies",
    title: {
      zh: "05 · 用结构理解机器人",
      en: "05 · Read the robot through its structure",
    },
    summary: {
      zh: "比较人形、四足与机械臂的支撑和运动链。",
      en: "Compare the support and motion chains of humanoids, quadrupeds, and arms.",
    },
    body: {
      zh: "先看连接树，再看外形标签。机械臂常以基座到末端的链条完成定位；足式机器人同时涉及躯干、多条腿和环境接触。四足与人形在支撑布局上不同，但仅靠模型姿态不能判断哪一种更稳定。实际稳定性还取决于接触、质量分布、控制器和运动速度。不同机型的关节名称或数量也不能跨配置照搬。",
      en: "Start with the connection tree rather than the silhouette. An arm commonly positions an end effector through a base-to-tip chain; a legged robot involves a trunk, multiple legs, and contact with its environment. Quadrupeds and humanoids have different support layouts, but a displayed pose alone cannot establish which is more stable. Contact, mass distribution, control, and speed matter. Joint names and counts must not be copied across configurations.",
    },
    task: {
      zh: "切换两种形态的模型，各选一条从主体到末端的链。比较连接数量、运动方向和末端用途，只记录模型实际呈现的内容。",
      en: "Switch between two robot forms and trace one body-to-endpoint chain in each. Compare connections, motion directions, and endpoint roles using only what the models actually show.",
    },
    sourceUrl: unitreeSource,
  },
  {
    id: "configuration-evidence",
    title: {
      zh: "06 · 先确定是哪一台",
      en: "06 · Identify the exact configuration",
    },
    summary: {
      zh: "型号相同，不代表代际、手部和传感器配置相同。",
      en: "A shared product name does not establish an identical configuration.",
    },
    body: {
      zh: "一个可信模型需要明确厂商、型号、代际、配置和资产版本。官方仓库提供了资产入口，但仍要核对具体文件、提交版本与许可。某个版本的手部、传感器和关节设置不能直接套到另一个版本。外观依据、运动机构依据和内部拆解依据分别审核；已核验外观并不代表电路板、布线或电机内部也已确认。",
      en: "A trustworthy model needs an identified manufacturer, model, generation, configuration, and asset version. An official repository is an entry point, but individual files, revisions, and licenses still need checking. Hands, sensors, or joints from one variant cannot automatically be assigned to another. Review appearance, kinematics, and internal disassembly evidence separately: verified appearance does not verify circuit boards, wiring, or actuator internals.",
    },
    task: {
      zh: "查看当前机型的来源与范围说明，写下一个已支持的层级和一个未验证的部分。无法确认的内容保留为未知。",
      en: "Read the selected model’s source and scope notes. Identify one supported layer and one unverified area. Leave unknown information explicitly unknown.",
    },
    sourceUrl: unitreeSource,
  },
  {
    id: "exploded-not-disassembled",
    title: {
      zh: "07 · 爆炸展示不是维修规程",
      en: "07 · An exploded view is not a service procedure",
    },
    summary: {
      zh: "视觉分离帮助理解结构，却不能证明真实拆卸顺序。",
      en: "Visual separation explains structure, not necessarily a real removal sequence.",
    },
    body: {
      zh: "把模型连杆向外移动，可以帮助观察被遮挡的形状和连接树。但 URDF 的父子关系描述运动连接，不一定等同于维修拆装依赖。真实拆卸还需要紧固件、连接器、线束、工具和安全步骤的证据。没有这些资料时，应把爆炸视图标为结构展示，不编造螺钉规格、扭矩或“先拆哪个电机”的指令。",
      en: "Separating model links can reveal occluded shapes and the connection tree. However, URDF parent-child relationships describe kinematic connections, not necessarily service dependencies. Physical disassembly requires evidence about fasteners, connectors, wiring, tools, and safety steps. Without that evidence, label an exploded view as a structural visualization; do not invent screw sizes, torques, or motor-removal instructions.",
    },
    task: {
      zh: "比较整机与展开状态，找出一个此前被遮挡的连杆。把观察写成“模型显示”，不要把它改写成已验证的维修步骤。",
      en: "Compare assembled and separated views and identify a previously occluded link. Describe it as a model observation, not as a validated service instruction.",
    },
    sourceUrl: jointSource,
  },
  {
    id: "simulation-boundary",
    title: {
      zh: "08 · 从运动学到真实执行",
      en: "08 · From kinematics to actual execution",
    },
    summary: {
      zh: "区分姿态编辑、动作回放、动力学与 SDK 控制。",
      en: "Separate pose editing, motion playback, dynamics, and SDK control.",
    },
    body: {
      zh: "运动学根据关节位置计算连杆姿态，不求解重力、接触和驱动力矩。动作回放按时间读取已有轨迹，也不等于控制器实时输出。动力学仿真需要模型参数、物理求解和接触处理；SDK 联调还需要支持的接口、消息和运行环境。Unitree MuJoCo 提供官方仿真接入方向，但特定模型和接口必须按其当前文档实际验证。没有运行验证，就不能把页面动画称为完整实机 SDK 仿真。",
      en: "Kinematics computes link poses from joint positions without solving gravity, contact, or actuator torque. Motion playback follows an existing trajectory and is not necessarily live controller output. Dynamics requires model parameters, a physics solver, and contact handling. SDK integration additionally needs supported interfaces, messages, and a runtime. Unitree MuJoCo provides an official integration route, but each model and interface must be tested against its current documentation. A webpage animation is not proof of a working robot SDK simulation.",
    },
    task: {
      zh: "判断当前操作属于姿态编辑、动作回放还是已验证的动力学。列出证据；如果只有关节滑条，就只记录运动学实验。",
      en: "Classify the current interaction as pose editing, playback, or verified dynamics. State the evidence; joint sliders alone establish only a kinematic experiment.",
    },
    sourceUrl: simulationSource,
  },
];

export const questions: Question[] = [
  {
    id: "q-chain",
    prompt: {
      zh: "改变上游关节时，为什么多个连杆会一起移动？",
      en: "Why can several links move when an upstream joint changes?",
    },
    options: [
      {
        zh: "它们在连接树中位于该关节下游",
        en: "They are downstream of that joint in the connection tree",
      },
      { zh: "所有网格都使用相同材质", en: "All meshes share a material" },
      { zh: "渲染器会随机联动零件", en: "The renderer randomly couples parts" },
    ],
    answer: 0,
    explanation: {
      zh: "父子变换沿运动链传递，因此下游连杆继承上游运动。",
      en: "Parent-child transforms propagate along the chain, carrying downstream links with the upstream motion.",
    },
    sourceUrl: jointSource,
  },
  {
    id: "q-fixed",
    prompt: {
      zh: "哪一种关节不增加运动自由度？",
      en: "Which joint type adds no motion DOF?",
    },
    options: [
      { zh: "转动关节 revolute", en: "Revolute" },
      { zh: "固定关节 fixed", en: "Fixed" },
      { zh: "移动关节 prismatic", en: "Prismatic" },
    ],
    answer: 1,
    explanation: {
      zh: "固定关节保持父子连杆的相对变换，不提供可动轴。",
      en: "A fixed joint preserves the relative transform between its parent and child without a movable axis.",
    },
    sourceUrl: jointSource,
  },
  {
    id: "q-collision",
    prompt: {
      zh: "模型中的 collision 几何能证明什么？",
      en: "What does collision geometry establish?",
    },
    options: [
      {
        zh: "它一定是真实内部结构",
        en: "It must be the real internal structure",
      },
      {
        zh: "它是用于碰撞计算的几何描述，可能被简化",
        en: "It is geometry for collision calculations and may be simplified",
      },
      {
        zh: "它能独立证明全部电机性能",
        en: "It independently proves every motor’s performance",
      },
    ],
    answer: 1,
    explanation: {
      zh: "碰撞几何与外观、惯性分别定义，不能把简化碰撞体当成真机内部件。",
      en: "Collision, visual, and inertial data are separate. A simplified collision shape is not evidence of an internal component.",
    },
    sourceUrl: linkSource,
  },
  {
    id: "q-limits",
    prompt: {
      zh: "关节姿态在位置限位内，是否就能保证真机安全？",
      en: "Does a pose within joint position limits guarantee real-hardware safety?",
    },
    options: [
      {
        zh: "能，限位包含所有物理约束",
        en: "Yes; limits include every physical constraint",
      },
      { zh: "能，只要模型看起来平衡", en: "Yes, if the model looks balanced" },
      {
        zh: "不能，还需考虑碰撞、平衡、载荷和控制等因素",
        en: "No; collision, balance, loads, control, and other factors still matter",
      },
    ],
    answer: 2,
    explanation: {
      zh: "位置限位只约束关节范围，不是完整安全验证。",
      en: "Position limits constrain the joint range; they are not a complete safety validation.",
    },
    sourceUrl: jointSource,
  },
  {
    id: "q-morphology",
    prompt: {
      zh: "比较人形和四足模型，哪一种结论更可靠？",
      en: "Which conclusion is defensible when comparing humanoid and quadruped models?",
    },
    options: [
      {
        zh: "可以比较连接树；真实稳定性还需接触和控制等证据",
        en: "Their connection trees can be compared; stability still requires contact and control evidence",
      },
      {
        zh: "看一张静态截图就能判断全部运动性能",
        en: "One still image determines all motion performance",
      },
      {
        zh: "外形相似就可以共用所有关节参数",
        en: "Similar silhouettes justify sharing every joint parameter",
      },
    ],
    answer: 0,
    explanation: {
      zh: "结构模型支持机构观察，但不足以证明动态稳定性或跨型号参数等价。",
      en: "A structural model supports kinematic observations, not proof of dynamic stability or equivalent parameters across models.",
    },
    sourceUrl: unitreeSource,
  },
  {
    id: "q-evidence",
    prompt: {
      zh: "已获得官方外观模型，是否可以补画未知电路板并称为真机还原？",
      en: "With an official exterior model, may unknown circuit boards be invented and labeled authentic?",
    },
    options: [
      { zh: "可以，只要造型可信", en: "Yes, if they look plausible" },
      {
        zh: "不可以；内部证据应单独核验，缺口明确标注",
        en: "No; internal evidence needs separate verification and gaps must remain explicit",
      },
      {
        zh: "可以，官方仓库自动覆盖全部内部信息",
        en: "Yes; an official repository automatically covers every internal detail",
      },
    ],
    answer: 1,
    explanation: {
      zh: "外观、运动机构和内部结构是不同证据层级。模型来源官方也不能填补未知内容。",
      en: "Appearance, kinematics, and internals are distinct evidence layers. An official source does not resolve unknown details.",
    },
    sourceUrl: unitreeSource,
  },
  {
    id: "q-explode",
    prompt: {
      zh: "URDF 的父子连接树可以直接作为维修拆卸顺序吗？",
      en: "Can a URDF parent-child tree directly define a service disassembly sequence?",
    },
    options: [
      {
        zh: "可以，运动连接与维修依赖永远相同",
        en: "Yes; kinematic connections and service dependencies are always identical",
      },
      { zh: "可以，只需逆序播放", en: "Yes; just play it backward" },
      {
        zh: "不可以，还需要紧固件、连接器和维修步骤等资料",
        en: "No; fasteners, connectors, and service-procedure evidence are still needed",
      },
    ],
    answer: 2,
    explanation: {
      zh: "URDF 描述运动连接；可视化分离不能替代实际拆装依据。",
      en: "URDF describes kinematic connections. Visual separation cannot substitute for physical disassembly evidence.",
    },
    sourceUrl: jointSource,
  },
  {
    id: "q-runtime",
    prompt: {
      zh: "拖动关节滑条改变姿态，最准确的名称是什么？",
      en: "What is the most accurate name for changing a pose with joint sliders?",
    },
    options: [
      {
        zh: "运动学实验；不能据此宣称真实 SDK 或动力学已运行",
        en: "A kinematic experiment; it does not establish SDK or dynamics execution",
      },
      { zh: "已验证的真实电机控制", en: "Verified real motor control" },
      {
        zh: "完整硬件电路与固件仿真",
        en: "Complete circuit and firmware simulation",
      },
    ],
    answer: 0,
    explanation: {
      zh: "姿态变化可以仅由几何变换产生，SDK、物理引擎和板卡执行需要各自的运行证据。",
      en: "Pose changes can result from geometric transforms alone. SDK, physics, and board execution each require separate runtime evidence.",
    },
    sourceUrl: simulationSource,
  },
];
