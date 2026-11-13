import type { LocalizedText } from "./learning";
const t = (zh: string, en: string): LocalizedText => ({ zh, en });
export const ASSEMBLY_GUIDE_COMMIT = "e6ffde60312365c5452c46189a26872483943154";
export const PHYSICAL_READING_KEY = `robot-radar:assembly-reading:v1:so101:${ASSEMBLY_GUIDE_COMMIT}`;
export const physicalAssemblyDisclaimer = t(
  "这是官方装配步骤阅读课。完成标记只表示已阅读并理解，不代表已经装配实物、拧紧螺钉、接线、校准或通过安全验收。这里不会连接或控制硬件。",
  "This is an official-procedure reading lesson. Completion means read and understood, not physical assembly, tightened screws, wiring, calibration, or safety acceptance. No hardware is connected or controlled here.",
);
export interface PhysicalReadingModule {
  id: string;
  title: LocalizedText;
  body: LocalizedText;
  partIds: string[];
  prerequisites: string[];
  sourceUrl: string;
  sourceLines: [number, number];
  additionalSourceUrls?: string[];
  fasteners: LocalizedText[];
  ambiguity?: LocalizedText;
  question: {
    prompt: LocalizedText;
    options: LocalizedText[];
    answer: number;
    explanation: LocalizedText;
  };
}
function module(
  index: number,
  title: LocalizedText,
  body: LocalizedText,
  partIds: string[],
  sourceLines: [number, number],
  fasteners: LocalizedText[],
  question: PhysicalReadingModule["question"],
  ambiguity?: LocalizedText,
): PhysicalReadingModule {
  return {
    id: `so101-a${index}`,
    title,
    body,
    partIds,
    sourceLines,
    fasteners,
    question,
    ambiguity,
    additionalSourceUrls:
      index === 0
        ? [
            "https://github.com/TheRobotStudio/SO-ARM100/blob/a758567c3978dfeefe282ede0500085a48fe8f78/README.md#sourcing-parts",
          ]
        : index === 1
          ? [
              "https://github.com/TheRobotStudio/SO-ARM100/blob/a758567c3978dfeefe282ede0500085a48fe8f78/3DPRINT.md",
            ]
          : index === 8
            ? [
                `https://github.com/huggingface/lerobot/blob/${ASSEMBLY_GUIDE_COMMIT}/docs/source/so101.mdx#L102-L108`,
                `https://github.com/huggingface/lerobot/blob/${ASSEMBLY_GUIDE_COMMIT}/docs/source/so101.mdx#L158-L197`,
              ]
            : [],
    prerequisites: index ? [`so101-a${index - 1}`] : [],
    sourceUrl: `https://github.com/huggingface/lerobot/blob/${ASSEMBLY_GUIDE_COMMIT}/docs/source/so101.mdx#L${sourceLines[0]}-L${sourceLines[1]}`,
  };
}
export const physicalReadingModules: PhysicalReadingModule[] = [
  module(
    0,
    t("识别 follower 配置", "Identify the follower"),
    t(
      "官方文字说明 follower 使用 6 个 STS3215，减速比均为 1/345。Leader 使用不同减速比组合，手柄与扳机不是本课的夹爪。7.4 V 与 12 V 电机配置不可混用供电资料；模型外形不能证明手中硬件的电压。这里只核对知识，不执行供电。",
      "The official text specifies six STS3215 motors, all with 1/345 gearing, for the follower. The leader uses different gearing; its handle and trigger are not this lesson's gripper. Do not mix power information for 7.4 V and 12 V variants; the model shape does not establish your hardware voltage. This lesson checks understanding without applying power.",
    ),
    ["base_link", "gripper_link"],
    [33, 44],
    [],
    {
      prompt: t(
        "本课对象是什么？",
        "Which configuration does this lesson cover?",
      ),
      options: [
        t("SO-101 follower", "SO-101 follower"),
        t("SO-100 leader", "SO-100 leader"),
        t("所有外观相似的机械臂", "Every similarly shaped arm"),
      ],
      answer: 0,
      explanation: t(
        "只覆盖 SO-101 follower；不能把 leader 减速比与手柄步骤合并进来。",
        "Only the SO-101 follower is covered; leader gearing and handle steps must not be merged into it.",
      ),
    },
  ),
  module(
    1,
    t("打印件与线缆前置", "Printed parts and cable preparation"),
    t(
      "Clean Parts 要求清理打印支撑，并建议电机放入后、继续装配前先接一条 3-pin 线。这提示线缆接入时机，不表示网页已检测实际连接。查看官方打印清单，整机参考 STL 不能直接当成可打印零件。",
      "Clean Parts calls for removing print supports and recommends fitting a 3-pin cable after placing a motor, before continuing assembly. This explains cable access timing; the website has not detected a physical connection. Consult the official print list rather than treating the whole-arm reference STL as a printable part.",
    ),
    ["base_link"],
    [231, 235],
    [],
    {
      prompt: t(
        "网页显示线缆前置说明后，能确认什么？",
        "What can the website establish after showing cable-preparation guidance?",
      ),
      options: [
        t("实际插头已接好", "The physical connector is attached"),
        t(
          "已理解官方建议的接线时机",
          "The documented cable-access timing is understood",
        ),
        t("电机EEPROM已写入", "The motor EEPROM has been programmed"),
      ],
      answer: 1,
      explanation: t(
        "学习记录只证明阅读理解，不能检测或证明实际线缆状态。",
        "A learning record tracks comprehension; it neither detects nor proves the cable's physical state.",
      ),
    },
  ),
  module(
    2,
    t("基座与第一关节", "Base and joint 1"),
    t(
      "官方顺序先安装两个舵盘，再把电机1放入底座并固定，套入第一支架，连接肩件，最后加肩电机支架。顶部舵盘有中心螺钉，底部没有该螺钉。模型高亮只定位装配体，不是逐孔安装验证。",
      "The documented sequence installs both horns, places and fixes motor 1 in the base, adds the first holder, attaches the shoulder part, then adds its motor holder. The top horn has a retaining screw; the bottom horn does not. Model highlighting identifies assemblies, not verified screw-hole installation.",
    ),
    ["base_link", "shoulder_link"],
    [237, 245],
    [
      t(
        "顶部舵盘：1×M3×6；底部无该螺钉。",
        "Top horn: 1×M3×6; no corresponding bottom-horn screw.",
      ),
      t(
        "电机固定：4×M2×6（上2、下2）；第一支架：2×M2×6（每侧1）。",
        "Motor: 4×M2×6 (two top, two bottom); first holder: 2×M2×6 (one each side).",
      ),
      t(
        "肩件：顶部4×M3×6，底部4×M3×6。",
        "Shoulder part: 4×M3×6 on top and 4×M3×6 on the bottom.",
      ),
    ],
    {
      prompt: t(
        "底部舵盘需要同样的中心螺钉吗？",
        "Does the bottom horn need the same retaining screw?",
      ),
      options: [
        t("需要，所有位置相同", "Yes, every location is identical"),
        t("应自行换成更长螺钉", "Use a longer screw instead"),
        t(
          "此处官方文字说不需要",
          "The official text says none is required here",
        ),
      ],
      answer: 2,
      explanation: t(
        "按此节文字，顶部用M3×6，底部不放该螺钉；不能凭对称外观补加。",
        "This section specifies M3×6 for the top horn and no corresponding screw below; visual symmetry is not evidence to add one.",
      ),
    },
  ),
  module(
    3,
    t("第二关节与上臂", "Joint 2 and upper arm"),
    t(
      "安装两舵盘后，电机2从上方滑入。用M2固定电机，再将上臂连接到输出侧。此节明确写上臂每侧4颗M3×6，与后文模糊的“两侧”措辞不同。",
      "After fitting both horns, motor 2 slides in from above. M2 screws fix the motor; the upper arm then connects to the output side. This section explicitly says four M3×6 screws on each side, unlike ambiguous wording in later sections.",
    ),
    ["shoulder_link", "upper_arm_link"],
    [256, 261],
    [
      t(
        "顶部舵盘1×M3×6，底部无该螺钉。",
        "Top horn: 1×M3×6; no corresponding bottom screw.",
      ),
      t(
        "电机2：4×M2×6；上臂：每侧4×M3×6。",
        "Motor 2: 4×M2×6; upper arm: 4×M3×6 on each side.",
      ),
    ],
    {
      prompt: t(
        "此节的 each side 表示什么？",
        "What does each side mean in this section?",
      ),
      options: [
        t("每侧4颗", "Four on each side"),
        t("整机总共4颗", "Four for the entire arm"),
        t("数量没有给出", "No quantity is stated"),
      ],
      answer: 0,
      explanation: t(
        "本节明确给出每侧数量；这不能自动套到其他措辞不同的步骤。",
        "This section explicitly specifies a per-side quantity; do not transfer it to differently worded steps.",
      ),
    },
  ),
  module(
    4,
    t("第三关节与前臂", "Joint 3 and forearm"),
    t(
      "官方文字先安装两舵盘，放入并固定电机3，再连接前臂。电机壳体固定与输出侧连接是两类紧固位置，不能交换螺钉规格；文档没有提供拧紧扭矩。",
      "The text fits both horns, inserts and fixes motor 3, then connects the forearm. Motor-body fixing and output-side attachment are different fastening locations; do not swap their screw specifications. No tightening torque is supplied.",
    ),
    ["upper_arm_link", "lower_arm_link"],
    [272, 276],
    [
      t(
        "顶部舵盘1×M3×6，底部无该螺钉。",
        "Top horn: 1×M3×6; no corresponding bottom screw.",
      ),
      t(
        "电机3：4×M2×6；前臂：每侧4×M3×6。",
        "Motor 3: 4×M2×6; forearm: 4×M3×6 on each side.",
      ),
    ],
    {
      prompt: t(
        "原文未给拧紧扭矩，应怎样显示？",
        "How should missing tightening torque be represented?",
      ),
      options: [
        t("根据螺钉直径自动猜一个", "Guess it from the screw diameter"),
        t(
          "明确未提供，不编造值",
          "Mark it unspecified without inventing a value",
        ),
        t("全部设成相同扭矩", "Assign one torque to everything"),
      ],
      answer: 1,
      explanation: t(
        "本课不补造原文未提供的工艺或安全参数。",
        "This lesson does not invent manufacturing or safety parameters absent from the source.",
      ),
    },
  ),
  module(
    5,
    t("第四关节支架", "Joint 4 holder"),
    t(
      "官方先装两舵盘，再套入motor holder 4，随后放入电机4并固定。该次序来自文字，不是把URDF反向播放得到的。尚未逐帧核验视频孔位。",
      "The text installs both horns, slides on motor holder 4, then inserts and fixes motor 4. This order comes from the written procedure, not reversed URDF playback. Video hole locations have not been checked frame by frame.",
    ),
    ["lower_arm_link"],
    [287, 292],
    [
      t(
        "顶部舵盘1×M3×6，底部无该螺钉；电机4用4×M2×6固定。",
        "Top horn: 1×M3×6 with none below; motor 4 is fixed with 4×M2×6.",
      ),
    ],
    {
      prompt: t("此节说明的顺序是？", "What order does this section describe?"),
      options: [
        t("电机 → 支架 → 舵盘", "Motor → holder → horns"),
        t("只需逆序播放模型", "Simply reverse the model animation"),
        t("舵盘 → 支架 → 电机 → 固定", "Horns → holder → motor → fixing"),
      ],
      answer: 2,
      explanation: t(
        "顺序直接来自Joint 4文字；它不是完整维修安全规程。",
        "The order comes directly from the Joint 4 text; it is not a complete service-safety procedure.",
      ),
    },
  ),
  module(
    6,
    t("第五关节与腕部", "Joint 5 and wrist"),
    t(
      "电机5放入腕支架，用前方两颗M2固定。它只安装一个舵盘，用M3中心螺钉固定，再把腕部连接到电机4。两侧连接螺钉的总数保留原文歧义，不自行加总。",
      "Motor 5 fits in the wrist holder with two front M2 screws. It receives only one horn with an M3 retaining screw, then the wrist connects to motor 4. The total number of side-attachment screws remains explicitly ambiguous rather than being guessed.",
    ),
    ["wrist_link", "lower_arm_link"],
    [303, 307],
    [
      t(
        "前方2×M2×6；单个舵盘1×M3×6。",
        "Two front M2×6 screws; one horn with 1×M3×6.",
      ),
      t(
        "腕部两侧使用M3×6，准确总数待复核。",
        "M3×6 screws on the wrist sides; exact total awaits verification.",
      ),
    ],
    {
      prompt: t(
        "这一步应直接把侧面螺钉总数写为8吗？",
        "Should this step directly state eight side screws in total?",
      ),
      options: [
        t(
          "不应，both sides措辞需要进一步核对",
          "No; the both sides wording needs further checking",
        ),
        t("应，所有关节都一样", "Yes; every joint is identical"),
        t(
          "应，URDF能自动给出螺钉数",
          "Yes; URDF automatically specifies screw counts",
        ),
      ],
      answer: 0,
      explanation: t(
        "原文没有像Joint 2/3那样明确each side，不推断4颗合计还是每侧4颗。",
        "Unlike Joint 2/3, this wording does not explicitly say each side; do not assume four total or four per side.",
      ),
    },
    t(
      "原文为“4 M3x6mm screws on both sides”。仅文字不能明确是4颗合计还是每侧4颗；视频/孔位尚未复核。",
      "The source says “4 M3x6mm screws on both sides.” Text alone does not resolve four total versus four per side; video/hole verification is pending.",
    ),
  ),
  module(
    7,
    t("Follower 夹爪", "Follower gripper"),
    t(
      "固定爪接到电机5舵盘；放入并固定夹爪电机，装两舵盘，再装活动爪。只读取Follower分支，不纳入Leader手柄与扳机。活动爪两侧螺钉总数同样需要后续复核。",
      "The fixed gripper attaches to motor 5's horn; the gripper motor is inserted and fixed, both horns are fitted, then the moving jaw is added. Only the Follower branch is used, not the Leader handle or trigger. The total side-screw count for the moving jaw also needs further checking.",
    ),
    ["gripper_link", "moving_jaw_so101_v1_link"],
    [318, 326],
    [
      t(
        "固定爪到腕舵盘：4×M3×6；夹爪电机：每侧2×M2×6。",
        "Fixed gripper to wrist horn: 4×M3×6; gripper motor: 2×M2×6 each side.",
      ),
      t(
        "顶部舵盘1×M3×6，底部无该螺钉；活动爪两侧M3×6总数待复核。",
        "Top horn: 1×M3×6 with none below; moving-jaw side M3×6 total remains unverified.",
      ),
    ],
    {
      prompt: t(
        "本课是否包含Leader的手柄和扳机？",
        "Does this lesson include the Leader handle and trigger?",
      ),
      options: [
        t("包含，名字相似即可", "Yes; similar names are enough"),
        t(
          "不包含，只针对Follower夹爪",
          "No; it covers only the Follower gripper",
        ),
        t("由模型颜色决定", "It depends on the model color"),
      ],
      answer: 1,
      explanation: t(
        "两种配置在官方指南中是不同分支，不能混用。",
        "The official guide separates the configurations into different branches; they must not be mixed.",
      ),
    },
    t(
      "活动爪原文同样写“4 M3x6mm screws on both sides”；不据此自动生成8颗总量。",
      "The moving-jaw text also says “4 M3x6mm screws on both sides”; it is not automatically converted into a total of eight.",
    ),
  ),
  module(
    8,
    t("阅读校准与验收边界", "Read calibration and verification boundaries"),
    t(
      "官方配置说明要求独立电机ID、相同baudrate，逐个单独配置后再串联。真实校准包含中间姿态与范围采集。这些操作会涉及实际硬件，本课不执行命令、不扫描串口、不供电，也不将阅读结果称为已校准。",
      "The configuration guidance requires unique motor IDs and a shared baudrate, with motors configured individually before daisy-chaining. Actual calibration includes a middle pose and range recording. These involve hardware: this lesson runs no commands, scans no serial ports, applies no power, and never labels reading progress as calibrated.",
    ),
    ["base_link", "shoulder_link", "gripper_link"],
    [357, 399],
    [],
    {
      prompt: t(
        "完成全部问答后，以下哪项真实成立？",
        "After completing every question, which statement is actually established?",
      ),
      options: [
        t("实体电机已经完成校准", "The physical motors are calibrated"),
        t("机械臂通过安全认证", "The arm has passed safety certification"),
        t(
          "已完成官方装配文字的阅读与理解练习",
          "The official-procedure reading and comprehension exercise is complete",
        ),
      ],
      answer: 2,
      explanation: t(
        "只完成学习。没有硬件执行记录，不能宣称实体装配、校准或安全验收。",
        "Only learning is complete. Without hardware execution evidence, physical assembly, calibration, and safety acceptance cannot be claimed.",
      ),
    },
  ),
];

export interface PhysicalReadingProgress {
  version: 1;
  read: string[];
  answers: Record<string, number>;
}
export const emptyPhysicalProgress = (): PhysicalReadingProgress => ({
  version: 1,
  read: [],
  answers: {},
});
export function understoodPhysicalModules(
  progress: PhysicalReadingProgress,
): string[] {
  const done: string[] = [];
  for (const entry of physicalReadingModules) {
    if (
      progress.read.includes(entry.id) &&
      progress.answers[entry.id] === entry.question.answer &&
      entry.prerequisites.every((id) => done.includes(id))
    )
      done.push(entry.id);
  }
  return done;
}
export function restorePhysicalProgress(
  raw: string | null,
): PhysicalReadingProgress {
  if (!raw || raw.length > 16384) return emptyPhysicalProgress();
  try {
    const value = JSON.parse(raw);
    if (
      !value ||
      value.version !== 1 ||
      !Array.isArray(value.read) ||
      !value.answers ||
      typeof value.answers !== "object" ||
      Array.isArray(value.answers)
    )
      return emptyPhysicalProgress();
    const result = emptyPhysicalProgress();
    for (const entry of physicalReadingModules) {
      const done = understoodPhysicalModules(result);
      if (
        value.read.includes(entry.id) &&
        entry.prerequisites.every((id) => done.includes(id))
      ) {
        result.read.push(entry.id);
        const answer = value.answers[entry.id];
        if (
          Number.isInteger(answer) &&
          answer >= 0 &&
          answer < entry.question.options.length
        )
          result.answers[entry.id] = answer;
      }
    }
    return result;
  } catch {
    return emptyPhysicalProgress();
  }
}
export function markPhysicalRead(
  progress: PhysicalReadingProgress,
  id: string,
): PhysicalReadingProgress {
  const entry = physicalReadingModules.find((item) => item.id === id);
  const done = understoodPhysicalModules(progress);
  if (!entry || !entry.prerequisites.every((key) => done.includes(key)))
    throw new Error("Read prerequisite modules and check understanding first.");
  return {
    ...progress,
    read: [...new Set([...progress.read, id])],
    answers: { ...progress.answers },
  };
}
export function answerPhysicalQuestion(
  progress: PhysicalReadingProgress,
  id: string,
  answer: number,
): PhysicalReadingProgress {
  const entry = physicalReadingModules.find((item) => item.id === id);
  if (
    !entry ||
    !progress.read.includes(id) ||
    !Number.isInteger(answer) ||
    answer < 0 ||
    answer >= entry.question.options.length
  )
    throw new Error("Read the module before answering a valid option.");
  const candidate = {
    ...progress,
    read: [...progress.read],
    answers: { ...progress.answers, [id]: answer },
  };
  // Revising an earlier answer invalidates downstream learning claims.
  return restorePhysicalProgress(JSON.stringify(candidate));
}
