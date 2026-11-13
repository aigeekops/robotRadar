import ArmReachExperience from "./ArmReachExperience";
import ContactGraspExperience from "./ContactGraspExperience";
import ExplorationTaskPanel from "./ExplorationTaskPanel";
import { handDriveLimits } from "./core/handLab";
import {
  createExperimentTemplate,
  experimentTemplateFilename,
  experimentJoints,
  parseExperimentJoints,
  parseMotionProgram,
} from "./core/experimentTemplate";
import { industryResearch } from "./robotResearch";
import GripperLabPanel from "./GripperLabPanel";
import GroupedPartsPanel from "./GroupedPartsPanel";
import MakerProjects from "./MakerProjects";
import HandLabPanel from "./HandLabPanel";
import { handDefinitionForRobot } from "./core/handRegistry";
import {
  normalizeRobotMode,
  supportedRobotModes,
  normalizeRobotExperience,
  supportsRobotDrive,
  supportsRobotDynamics,
  manipulationExperienceFor,
  type RobotExperience,
} from "./core/robotModes";
import {
  initialLanguage,
  LANGUAGE_PREFERENCE_KEY,
  manualLanguagePreference,
} from "./core/locale";
import { siteAsset } from "./siteAssets";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  Box,
  Check,
  ChevronRight,
  CircleHelp,
  Code2,
  Eye,
  EyeOff,
  GitCompareArrows,
  Globe2,
  Layers3,
  Maximize2,
  MousePointer2,
  Pause,
  Play,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Download,
  Upload,
  Focus,
  Workflow,
  Wrench,
  X,
} from "lucide-react";
import RobotViewer from "./viewer/RobotViewer";
import StructureNavigator from "./StructureNavigator";
import PartEvidencePanel from "./PartEvidencePanel";
import "./styles/partEvidence.css";
import CompareExperience from "./CompareExperience";
import BuildKitPanel from "./BuildKitPanel";
import ExperiencePreferences from "./ExperiencePreferences";
import DynamicsPanel from "./DynamicsPanel";
import DirectMotionPanel from "./DirectMotionPanel";
import DriveExperience from "./DriveExperience";
import AssemblyExperience from "./AssemblyExperience";
import AssemblyPanel from "./AssemblyPanel";
import PhysicalAssemblyPanel from "./PhysicalAssemblyPanel";
import StructureLessonsPanel from "./StructureLessonsPanel";
import {
  parseNavigation,
  serializeNavigation,
  writeNavigation,
  type NavigationView,
} from "./core/navigation";
import type { JointInfo, Lang, ModelInfo, RobotEntry } from "./types";
import { lessons, questions } from "./learning";
import { robotLessons } from "./robotLearning";

type Mode =
  | "parts"
  | "joints"
  | "learn"
  | "quiz"
  | "program"
  | "sources"
  | "systems"
  | "assembly"
  | "buildkit"
  | "hand"
  | "gripper";
type Page = "lab" | "catalog" | "compare" | "makers";
type Frame = { time: number; joints: Record<string, number> };
const STORE = "robot-radar-v1";
function readSaved(): { lang?: Lang; completed?: string[] } {
  try {
    const value = JSON.parse(localStorage.getItem(STORE) || "{}");
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  } catch {
    return {};
  }
}
function readLanguagePreference(): unknown {
  try {
    return JSON.parse(localStorage.getItem(LANGUAGE_PREFERENCE_KEY) || "null");
  } catch {
    return null;
  }
}
export default function App() {
  const saved = useRef(readSaved());
  const initialNavigation = useRef(
    parseNavigation(location.search, {
      fallback: {
        lang: initialLanguage({
          preference: readLanguagePreference(),
          legacy: saved.current,
          browser: navigator,
        }),
      },
    }),
  );
  const [lang, setLang] = useState<Lang>(initialNavigation.current.lang);
  const t = (zh: string, en: string) => (lang === "zh" ? zh : en);
  const formLabel = (form: string) =>
    ({
      humanoid: t("人形", "Humanoid"),
      quadruped: t("四足", "Quadruped"),
      mobile: t("移动机器人", "Mobile robot"),
      arm: t("机械臂", "Manipulator"),
      hand: t("灵巧手", "Dexterous hand"),
      gripper: t("工业夹爪", "Industrial gripper"),
      biped: t("双足机器人", "Biped"),
      "wheel-legged": t("轮足机器人", "Wheel-legged"),
    })[form] || form;
  const [robots, setRobots] = useState<RobotEntry[]>([]);
  const robotsRef = useRef(robots);
  robotsRef.current = robots;
  const [loadError, setLoadError] = useState(false);
  const [robotId, setRobotId] = useState(initialNavigation.current.robot || "");
  const [page, setPage] = useState<Page>(initialNavigation.current.page);
  const [briefing, setBriefing] = useState(
    () =>
      new URLSearchParams(location.search).get("showroom") === "1" ||
      (!new URLSearchParams(location.search).has("robot") &&
        !new URLSearchParams(location.search).has("mode")),
  );
  const [requestedExperience, setExperience] = useState<RobotExperience | null>(
    () => {
      const value = new URLSearchParams(location.search).get("experience");
      return value === "drive" ||
        value === "build" ||
        value === "reach" ||
        value === "grasp"
        ? value
        : null;
    },
  );
  const [requestedMode, setMode] = useState<Mode>(
    initialNavigation.current.mode,
  );
  const [assemblyFromExplore, setAssemblyFromExplore] = useState(false);
  const [assemblyContextPart, setAssemblyContextPart] = useState<string | null>(
    null,
  );
  const [assemblyView, setAssemblyView] = useState<"chain" | "physical">(
    "chain",
  );
  const [info, setInfo] = useState<ModelInfo>({ parts: [], joints: [] });
  const [selected, setSelected] = useState<string | null>(
    initialNavigation.current.part,
  );
  const [hidden, setHidden] = useState<string[]>([]);
  const [jointValues, setJointValues] = useState<Record<string, number>>({});
  const [explode, setExplode] = useState(0);
  const [view, setView] = useState<NavigationView>(
    initialNavigation.current.view,
  );
  const [groupedDisplay, setGroupedDisplay] = useState<{
    robotId: string;
    enabled: boolean;
    hiddenInstanceIds: string[];
  }>({ robotId: "", enabled: false, hiddenInstanceIds: [] });
  const [highlighted, setHighlighted] = useState<string[]>([]);
  const [focusToken, setFocusToken] = useState(0);
  const [viewToken, setViewToken] = useState(0);
  const observationSnapshot = useRef<{
    selected: string | null;
    hidden: string[];
    view: NavigationView;
    explode: number;
  } | null>(null);
  const [resetToken, setResetToken] = useState(0);
  const [search, setSearch] = useState("");
  const [lessonId, setLessonId] = useState(
    initialNavigation.current.lesson || lessons[0]?.id || "",
  );
  const [completed, setCompleted] = useState<string[]>(
    Array.isArray(saved.current.completed)
      ? saved.current.completed.filter((id: string) =>
          lessons.some((l) => l.id === id),
        )
      : [],
  );
  const [answers, setAnswers] = useState<Record<string, number>>(() => {
    try {
      const a = JSON.parse(localStorage.getItem(STORE + "-quiz") || "{}");
      return Object.fromEntries(
        questions
          .filter(
            (q) =>
              Number.isInteger(a?.[q.id]) &&
              a[q.id] >= 0 &&
              a[q.id] < q.options.length,
          )
          .map((q) => [q.id, a[q.id]]),
      );
    } catch {
      return {};
    }
  });
  const [program, setProgram] = useState("");
  const [programMode, setProgramMode] = useState<"kinematic" | "dynamics">(
    "kinematic",
  );
  const [programError, setProgramError] = useState("");
  const [running, setRunning] = useState(false);
  const [runTime, setRunTime] = useState(0);
  const [motionReset, setMotionReset] = useState(0);
  const [trace, setTrace] = useState<
    { time: number; values: Record<string, number> }[]
  >([]);
  useEffect(() => {
    try {
      localStorage.setItem(STORE + "-quiz", JSON.stringify(answers));
    } catch {}
  }, [answers]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const explodeFrame = useRef(0);
  const [formFilter, setFormFilter] = useState("all");
  const robot = robots.find((r) => r.id === robotId) || robots[0];
  const activeRobotId = useRef("");
  activeRobotId.current = robot?.id || "";
  const mode = robot
    ? normalizeRobotMode(robot.id, requestedMode)
    : requestedMode;
  const availableModes = supportedRobotModes(robot?.id || robotId);
  const experience = robot
    ? normalizeRobotExperience(robot, requestedExperience)
    : requestedExperience;
  const manipulationExperience = manipulationExperienceFor(robot);
  const handDefinition = robot ? handDefinitionForRobot(robot.id) : undefined;
  useEffect(() => {
    if (robot && requestedMode !== mode) setMode(mode);
  }, [robot?.id, requestedMode, mode]);
  useEffect(() => {
    if (robot && requestedExperience !== experience) setExperience(experience);
  }, [robot?.id, requestedExperience, experience]);
  useEffect(() => {
    const strip = document.querySelector<HTMLElement>(".robot-strip");
    const selected = strip?.querySelector<HTMLElement>(".robot-chip.selected");
    if (strip && selected)
      strip.scrollLeft = Math.max(
        0,
        selected.offsetLeft - strip.clientWidth / 2 + selected.clientWidth / 2,
      );
  }, [robot?.id, page, experience]);
  useEffect(() => {
    fetch(siteAsset("/robots/manifest.json"))
      .then((r) => {
        if (!r.ok) throw Error("manifest");
        return r.json();
      })
      .then((data) => {
        const entries = Array.isArray(data) ? data : data.robots;
        setRobots(entries);
        setRobotId((id) =>
          entries.some((r: RobotEntry) => r.id === id)
            ? id
            : entries[0]?.id || "",
        );
      })
      .catch(() => setLoadError(true));
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify({ completed }));
    } catch {
      /* unavailable storage must not break learning */
    }
    document.documentElement.lang = lang;
    document.title =
      lang === "zh"
        ? "Robot Radar · 具身智能与可拆解机器人学习站"
        : "Robot Radar · Embodied Robotics Learning";
  }, [lang, completed]);
  const stop = () => {
    cancelAnimationFrame(explodeFrame.current);
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setRunning(false);
  };
  useEffect(
    () => () => {
      cancelAnimationFrame(explodeFrame.current);
      if (timer.current) clearInterval(timer.current);
    },
    [],
  );
  const switchRobot = (id: string) => {
    stop();
    setMode(normalizeRobotMode(id, mode));
    const target = robots.find((entry) => entry.id === id);
    if (target) setExperience(normalizeRobotExperience(target, experience));
    if (id !== "g1") setProgramMode("kinematic");
    if (id === robotId) {
      setPage("lab");
      return;
    }
    setRobotId(id);
    setAssemblyView("chain");
    setSelected(null);
    setHidden([]);
    setJointValues({});
    setExplode(0);
    setInfo({ parts: [], joints: [] });
    setView("hero");
    setProgram("");
    setTrace([]);
    setRunTime(0);
    setProgramError("");
    setSearch("");
    setPage("lab");
    setHighlighted([]);
    observationSnapshot.current = null;
  };
  const restoreObservation = useCallback(() => {
    setViewToken((value) => value + 1);
    const snapshot = observationSnapshot.current;
    setHighlighted([]);
    if (snapshot) {
      setSelected(snapshot.selected);
      setHidden(snapshot.hidden);
      setView(snapshot.view);
      setExplode(snapshot.explode);
    } else {
      setHidden([]);
      setView("hero");
      setExplode(0);
    }
  }, []);
  const changeMode = (next: Mode) => {
    next = normalizeRobotMode(robot?.id || robotId, next);
    setBriefing(false);
    stop();
    const teaching = (value: Mode) =>
      value === "systems" || value === "assembly";
    if (teaching(next) && !teaching(mode))
      observationSnapshot.current = {
        selected,
        hidden: [...hidden],
        view,
        explode,
      };
    if (teaching(mode) && !teaching(next)) restoreObservation();
    if (mode === "program" && programMode === "dynamics") setJointValues({});
    if (
      next === "systems" &&
      !robotLessons.some(
        (lesson) => lesson.id === lessonId && lesson.robotId === robotId,
      )
    )
      setLessonId(
        robotLessons.find((lesson) => lesson.robotId === robotId)?.id || "",
      );
    if (next === "learn" && !lessons.some((lesson) => lesson.id === lessonId))
      setLessonId(lessons[0].id);
    if (teaching(next)) setSelected(null);
    setMode(next);
  };
  const inspectMechanism = useCallback(
    (ids: string[], isolate: boolean) => {
      setExplode(0);
      setHighlighted(ids);
      setHidden(isolate ? info.parts.filter((id) => !ids.includes(id)) : []);
      setFocusToken((value) => value + 1);
    },
    [info.parts],
  );
  const revealChain = useCallback(
    (ids: string[], focus: string[]) => {
      setExplode(0);
      setJointValues({});
      setHighlighted(focus);
      setHidden(info.parts.filter((id) => !ids.includes(id)));
      if (focus.length) setFocusToken((value) => value + 1);
    },
    [info.parts],
  );
  const routeRef = useRef({
    robot: robotId,
    lang,
    page,
    mode,
    part: selected,
    lesson: lessonId,
    view,
  });
  routeRef.current = {
    robot: robotId,
    lang,
    page,
    mode,
    part: selected,
    lesson: lessonId,
    view,
  };
  const firstRoute = useRef(true);
  const fromHistory = useRef(false);
  useEffect(() => {
    if (!robotId || !robots.length) return;
    const state = routeRef.current;
    const suffix =
      (briefing ? "&showroom=1" : "") +
      (experience ? `&experience=${experience}` : "");
    if (location.search !== serializeNavigation(state) + suffix) {
      writeNavigation(
        history,
        location.pathname,
        state,
        firstRoute.current || fromHistory.current ? "replace" : "push",
      );
      if (suffix)
        history.replaceState(
          history.state,
          "",
          location.pathname + serializeNavigation(state) + suffix,
        );
    }
    firstRoute.current = false;
    fromHistory.current = false;
  }, [
    robotId,
    lang,
    page,
    mode,
    selected,
    lessonId,
    view,
    robots.length,
    briefing,
    experience,
  ]);
  useEffect(() => {
    const restore = () => {
      cancelAnimationFrame(explodeFrame.current);
      setMotionReset((value) => value + 1);
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
      setRunning(false);
      const state = parseNavigation(location.search);
      const entries = robotsRef.current;
      const targetId = entries.some((entry) => entry.id === state.robot)
        ? state.robot!
        : entries[0]?.id || "g1";
      fromHistory.current = true;
      if (targetId !== routeRef.current.robot) {
        setInfo({ parts: [], joints: [] });
        setJointValues({});
        setProgram("");
        setTrace([]);
        setRunTime(0);
      }
      setRobotId(targetId);
      setLang(state.lang);
      setPage(state.page);
      setMode(normalizeRobotMode(targetId, state.mode));
      if (targetId !== "g1") setProgramMode("kinematic");
      setBriefing(new URLSearchParams(location.search).get("showroom") === "1");
      const requestedExperience = new URLSearchParams(location.search).get(
        "experience",
      );
      setExperience(
        requestedExperience === "drive" ||
          requestedExperience === "build" ||
          requestedExperience === "reach" ||
          requestedExperience === "grasp"
          ? requestedExperience
          : null,
      );
      setSelected(state.part);
      setLessonId(state.lesson || lessons[0].id);
      setView(state.view);
      setHidden([]);
      setHighlighted([]);
      setExplode(0);
      observationSnapshot.current = null;
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  const onLoaded = useCallback((newInfo: ModelInfo) => {
    setInfo(newInfo);
    setSelected((current) =>
      current && newInfo.parts.includes(current) ? current : null,
    );
    const first = newInfo.joints[0];
    if (first)
      setProgram(
        (current) =>
          current ||
          JSON.stringify(
            {
              frames: [
                { time: 0, joints: { [first.name]: 0 } },
                {
                  time: 2,
                  joints: {
                    [first.name]: Math.min(
                      first.upper,
                      Math.max(first.lower, 0.35),
                    ),
                  },
                },
                { time: 4, joints: { [first.name]: 0 } },
              ],
            },
            null,
            2,
          ),
      );
  }, []);
  const toggleHidden = (part: string) =>
    setHidden((v) =>
      v.includes(part) ? v.filter((p) => p !== part) : [...v, part],
    );
  const reset = () => {
    stop();
    setMotionReset((v) => v + 1);
    setViewToken((value) => value + 1);
    setHighlighted([]);
    setJointValues({});
    setHidden([]);
    setSelected(null);
    setExplode(0);
    setView("hero");
    setRunTime(0);
    setTrace([]);
  };
  const animateSeparation = () => {
    stop();
    const start = explode;
    const target = explode > 0.05 ? 0 : 0.7;
    if (document.documentElement.dataset.reducedMotion === "true") {
      setExplode(target);
      return;
    }
    const at = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - at) / 900, 1);
      const eased = progress * progress * (3 - 2 * progress);
      setExplode(start + (target - start) * eased);
      if (progress < 1) explodeFrame.current = requestAnimationFrame(tick);
    };
    explodeFrame.current = requestAnimationFrame(tick);
  };
  const showBriefing = () => {
    setAssemblyFromExplore(false);
    setAssemblyContextPart(null);
    reset();
    setExperience(null);
    setMode("parts");
    setBriefing(true);
    observationSnapshot.current = null;
  };
  // Direct game entries always start fresh; never inherit an inspected assembly part.
  const startGame = (next: RobotExperience) => {
    const allowed = normalizeRobotExperience(robot, next);
    if (!allowed) return;
    reset();
    setAssemblyFromExplore(false);
    setAssemblyContextPart(null);
    observationSnapshot.current = null;
    setPage("lab");
    setBriefing(false);
    setExperience(allowed);
  };
  const runProgram = () => {
    stop();
    setProgramError("");
    try {
      if (!robot) throw Error("Load a robot first");
      const effectiveJoints = experimentJoints(robot, info.joints);
      const frames = parseMotionProgram(program, effectiveJoints, lang);
      const states: Frame[] = [];
      let values = Object.fromEntries(
        effectiveJoints.map((j) => [
          j.name,
          Math.min(j.upper, Math.max(j.lower, 0)),
        ]),
      );
      for (const f of frames) {
        values = { ...values, ...f.joints };
        states.push({ time: f.time, joints: values });
      }
      setExplode(0);
      setTrace([]);
      setRunTime(0);
      setRunning(true);
      const started = performance.now();
      let lastTrace = -1;
      timer.current = setInterval(() => {
        const time = Math.min(
          (performance.now() - started) / 1000,
          states.at(-1)!.time,
        );
        let i = states.findIndex((f) => f.time >= time);
        if (i < 1) i = 1;
        const a = states[i - 1],
          b = states[i];
        const alpha = Math.min(1, (time - a.time) / (b.time - a.time));
        const v = Object.fromEntries(
          Object.keys(b.joints).map((name) => [
            name,
            a.joints[name] + (b.joints[name] - a.joints[name]) * alpha,
          ]),
        );
        setJointValues(v);
        setRunTime(time);
        if (time - lastTrace >= 0.2) {
          setTrace((log) => [
            ...log,
            { time: Number(time.toFixed(3)), values: v },
          ]);
          lastTrace = time;
        }
        if (time >= states.at(-1)!.time) {
          if (timer.current) clearInterval(timer.current);
          timer.current = null;
          setRunning(false);
        }
      }, 33);
    } catch (e) {
      setProgramError(e instanceof Error ? e.message : String(e));
    }
  };
  const download = (name: string, data: unknown) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };
  const importExperiment = async (file: File | undefined) => {
    if (!file) return;
    stop();
    setProgramError("");
    try {
      if (file.size > 100000)
        throw new Error(t("实验文件过大", "Experiment file too large"));
      const value = JSON.parse(await file.text());
      if (value.schemaVersion !== 1)
        throw new Error(
          t("不支持的实验版本", "Unsupported experiment version"),
        );
      const target = robots.find((r) => r.id === value.robotId);
      if (!target || typeof value.program !== "string")
        throw new Error(t("实验格式或机型无效", "Invalid experiment or robot"));
      if (value.sourceCommit !== target.sourceCommit)
        throw new Error(
          t(
            "模型版本不一致，请先核查资产",
            "Model revision differs; review the assets first",
          ),
        );
      const response = await fetch(siteAsset(target.urdfUrl));
      if (!response.ok)
        throw Error(t("无法读取目标模型", "Could not load target model"));
      const limits = parseExperimentJoints(target, await response.text());
      parseMotionProgram(value.program, limits, lang);
      switchRobot(target.id);
      setProgram(value.program);
      setMode("program");
      setRunTime(0);
      setTrace([]);
    } catch (error) {
      setProgramError(error instanceof Error ? error.message : String(error));
    }
  };
  const tabs: { id: Mode; icon: typeof Box; zh: string; en: string }[] = [
    { id: "parts", icon: Layers3, zh: "结构探索", en: "Structure" },
    { id: "joints", icon: SlidersHorizontal, zh: "关节实验", en: "Joints" },
    { id: "systems", icon: Workflow, zh: "机构课程", en: "Mechanisms" },
    { id: "assembly", icon: Wrench, zh: "运动链重建", en: "Chain builder" },
    ...(robot?.id === "franka-hand"
      ? [
          {
            id: "gripper" as Mode,
            icon: SlidersHorizontal,
            zh: "平行夹爪实验",
            en: "Gripper lab",
          },
        ]
      : []),
    ...(handDefinition
      ? [
          {
            id: "hand" as Mode,
            icon: SlidersHorizontal,
            zh: "灵巧手实验",
            en: "Hand lab",
          },
        ]
      : []),
    ...(["so101", "open-duck-mini"].includes(robot?.id || "")
      ? [
          {
            id: "buildkit" as Mode,
            icon: Download,
            zh: "制造资料",
            en: "Build kit",
          },
        ]
      : []),
    { id: "learn", icon: BookOpen, zh: "学习路径", en: "Lessons" },
    { id: "quiz", icon: CircleHelp, zh: "知识检验", en: "Quiz" },
    { id: "program", icon: Code2, zh: "运动编程", en: "Motion lab" },
    { id: "sources", icon: ShieldCheck, zh: "资料与边界", en: "Evidence" },
  ];
  const activeLesson = lessons.find((l) => l.id === lessonId) || lessons[0];
  const filteredParts = info.parts.filter((p) =>
    p.toLowerCase().includes(search.toLowerCase()),
  );
  const setJoint = (j: JointInfo, value: number) => {
    stop();
    setMotionReset((v) => v + 1);
    setExplode(0);
    setJointValues((v) => ({ ...v, [j.name]: value }));
  };
  return (
    <div
      className={`app-shell immersive ${page === "lab" ? "lab-page" : "data-page"} ${briefing ? "briefing-view" : "explore-view"}`}
    >
      <ExperiencePreferences lang={lang} />
      <header className="topbar">
        <a
          className="brand"
          href={import.meta.env.BASE_URL}
          onClick={(e) => {
            e.preventDefault();
            setPage("lab");
            showBriefing();
          }}
        >
          <div className="brand-icon">
            <Box size={22} />
          </div>
          <span>
            ROBOT<span className="brand-light">RADAR</span>
            <small>
              {t("具身智能 · 拆解 · 实践", "HARDWARE · STRUCTURE · DISCOVERY")}
            </small>
          </span>
        </a>
        <nav>
          <button
            className={page === "lab" ? "active" : ""}
            onClick={() => setPage("lab")}
          >
            {t("探索实验室", "Explore lab")}
          </button>
          <button
            className={page === "catalog" ? "active" : ""}
            onClick={() => {
              stop();
              setExperience(null);
              setPage("catalog");
            }}
          >
            {t("机器人档案", "Robot library")}
          </button>
          <button
            className={page === "compare" ? "active" : ""}
            onClick={() => {
              stop();
              setExperience(null);
              setPage("compare");
            }}
          >
            {t("机型对比", "Compare")}
          </button>
          <button
            className={page === "makers" ? "active" : ""}
            onClick={() => {
              stop();
              setExperience(null);
              setPage("makers");
            }}
          >
            {t("自制机器人", "Build your own")}
          </button>
          <a
            className="external-learning"
            href="https://aigeekops.github.io/learn-by-building/"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("学习平台 ↗", "Learning platform ↗")}
          </a>
        </nav>
        <div className="top-actions">
          <span className="local-badge">
            <i />
            {t("具身学习站", "EMBODIED LAB")}
          </span>
          <button
            className="language"
            onClick={() => {
              const next = lang === "zh" ? "en" : "zh";
              setLang(next);
              try {
                localStorage.setItem(
                  LANGUAGE_PREFERENCE_KEY,
                  JSON.stringify(manualLanguagePreference(next)),
                );
              } catch {
                /* switching still works when storage is unavailable */
              }
            }}
          >
            <Globe2 size={15} />
            {lang === "zh" ? "EN" : "中文"}
          </button>
        </div>
      </header>
      {experience === "build" && robot ? (
        <AssemblyExperience
          key={robot.id}
          robot={robot}
          lang={lang}
          contextPart={assemblyContextPart || undefined}
          exitLabel={
            assemblyFromExplore
              ? t("返回探索工作台", "Back to exploration")
              : undefined
          }
          onExit={() => {
            if (assemblyFromExplore) {
              setExperience(null);
              setBriefing(false);
              setMode("parts");
            } else showBriefing();
          }}
        />
      ) : experience === "drive" && robot ? (
        <DriveExperience robot={robot} lang={lang} onExit={showBriefing} />
      ) : experience === "grasp" && robot?.id === "leap_hand" ? (
        <ContactGraspExperience lang={lang} onExit={showBriefing} />
      ) : experience === "reach" && robot ? (
        <ArmReachExperience
          key={robot.id}
          robot={robot}
          lang={lang}
          onExit={showBriefing}
        />
      ) : loadError ? (
        <div className="empty-state">
          <h1>{t("机型清单加载失败", "Robot library failed to load")}</h1>
          <button onClick={() => location.reload()}>
            {t("重试", "Retry")}
          </button>
        </div>
      ) : !robot ? (
        <div className="empty-state">
          {t("正在准备实验室…", "Preparing the laboratory…")}
        </div>
      ) : (
        <>
          {page === "lab" && (
            <>
              <div className="section-heading">
                <div>
                  <div className="eyebrow">THE ROBOT ANATOMY LAB</div>
                  <h1>
                    {t(
                      "看见结构，理解机器。",
                      "See the structure. Understand the machine.",
                    )}
                  </h1>
                </div>
                <p>
                  {t(
                    "基于官方描述文件的真实机构探索",
                    "Explore real mechanisms from official description files",
                  )}
                  <span>
                    {t(
                      "从一个关节开始，走进机器人。",
                      "Start with a joint. Discover the whole robot.",
                    )}
                  </span>
                </p>
              </div>
              <div className="robot-strip">
                {robots.map((r, i) => (
                  <button
                    key={r.id}
                    className={`robot-chip ${robot.id === r.id ? "selected" : ""}`}
                    onClick={() => switchRobot(r.id)}
                  >
                    <span className="robot-number">0{i + 1}</span>
                    <img
                      className="fleet-thumbnail"
                      src={siteAsset(`/previews/${r.id}.png`)}
                      alt=""
                    />
                    <div>
                      <strong>{r.name[lang]}</strong>
                      <small>{r.manufacturer}</small>
                    </div>
                    <ChevronRight size={16} />
                  </button>
                ))}
                <div className="library-count">
                  <span>{String(robots.length).padStart(2, "0")}</span>
                  <small>{t("官方模型", "OFFICIAL MODELS")}</small>
                </div>
              </div>
              <main className="workspace">
                <div className="stage-column">
                  <div className="stage">
                    <div className="stage-heading">
                      <div>
                        <span className="eyebrow">
                          {robot.manufacturer.toUpperCase()} /{" "}
                          {t("机构观察", "MECHANISM VIEW")}
                        </span>
                        <h2>{robot.name[lang]}</h2>
                        <p>
                          <i />
                          {t(
                            "官方 URDF · 本地资源",
                            "OFFICIAL URDF · LOCAL ASSETS",
                          )}
                        </p>
                        <label className="model-picker">
                          {t("切换机型", "Switch robot")}
                          <select
                            aria-label={t("切换机型", "Switch robot")}
                            value={robot.id}
                            onChange={(e) => switchRobot(e.target.value)}
                          >
                            {robots.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name[lang]}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <button
                        className="icon-button"
                        aria-label={t("全屏", "Fullscreen")}
                        onClick={() =>
                          document.querySelector(".stage")?.requestFullscreen()
                        }
                      >
                        <Maximize2 size={17} />
                      </button>
                    </div>
                    {briefing && (
                      <section
                        className="hero-briefing"
                        aria-label={t("机型简报", "Robot briefing")}
                      >
                        <div className="bay-label">
                          <b>
                            BAY{" "}
                            {String(
                              robots.findIndex((r) => r.id === robot.id) + 1,
                            ).padStart(2, "0")}
                          </b>
                          <span>{formLabel(robot.form)}</span>
                          <span className="source-status">
                            {t("官方模型", "SOURCED MODEL")}
                          </span>
                        </div>
                        <h1>
                          {(
                            {
                              g1: "UNITREE G1",
                              go2: "GO2",
                              panda: "PANDA",
                              ur5e: "UR5e",
                              fr3: "FRANKA FR3",
                              so101: "SO-101",
                            } as Record<string, string>
                          )[robot.id] || robot.name[lang]}
                        </h1>
                        <div className="hero-manufacturer">
                          {robot.manufacturer}
                          <span>//</span>
                          {t(
                            "具身智能与可拆解机器人学习站",
                            "EMBODIED ROBOTICS · EXPLORE & BUILD",
                          )}
                        </div>
                        <p className="hero-description">
                          {robot.description[lang]}
                        </p>
                        <div className="hero-metrics">
                          <div>
                            <small>{t("模型连杆", "URDF LINKS")}</small>
                            <strong>{info.parts.length || "—"}</strong>
                          </div>
                          <div>
                            <small>{t("可控关节", "CONTROLS")}</small>
                            <strong>{info.joints.length || "—"}</strong>
                          </div>
                          <div>
                            <small>{t("资源来源", "PROVENANCE")}</small>
                            <strong className="metric-word">URDF</strong>
                          </div>
                        </div>
                        <div className="hero-actions">
                          <button
                            className="hero-action orange"
                            data-testid="home-game-build"
                            onClick={() => startGame("build")}
                          >
                            <span>01</span>
                            <div>
                              <strong>
                                {t("装配挑战", "ASSEMBLY CHALLENGE")}
                              </strong>
                              <small>
                                {t(
                                  "零件托盘 · 定位确认",
                                  "PARTS TRAY · ALIGNMENT CHECKS",
                                )}
                              </small>
                            </div>
                            <Wrench size={20} />
                          </button>
                          {manipulationExperience && (
                            <button
                              className="hero-action cyan"
                              data-testid="home-game-manipulation"
                              onClick={() => startGame(manipulationExperience)}
                            >
                              <span>02</span>
                              <div>
                                <strong>
                                  {manipulationExperience === "grasp"
                                    ? t("抓取挑战", "GRASP CHALLENGE")
                                    : t("定位挑战", "REACH CHALLENGE")}
                                </strong>
                                <small>
                                  {manipulationExperience === "grasp"
                                    ? t(
                                        "真实接触 · 拿起与放回",
                                        "CONTACT PHYSICS · PICK & RETURN",
                                      )
                                    : t(
                                        "关节操控 · 末端定位",
                                        "JOINT CONTROL · REACH THE TARGET",
                                      )}
                                </small>
                              </div>
                              <Play size={20} />
                            </button>
                          )}
                          {manipulationExperience && (
                            <button
                              data-testid="workspace-game-manipulation"
                              onClick={() => startGame(manipulationExperience)}
                            >
                              <Play size={15} />{" "}
                              {manipulationExperience === "grasp"
                                ? t("抓取挑战", "Grasp challenge")
                                : t("定位挑战", "Reach challenge")}
                            </button>
                          )}
                          {supportsRobotDrive(robot) && (
                            <button
                              className="hero-action cyan"
                              data-testid="home-game-drive"
                              onClick={() => startGame("drive")}
                            >
                              <span>02</span>
                              <div>
                                <strong>{t("游戏试驾", "DRIVING GAME")}</strong>
                                <small>
                                  {t(
                                    "方向操控 · 七门挑战",
                                    "DIRECTION CONTROL · 7 GATES",
                                  )}
                                </small>
                              </div>
                              <Play size={20} />
                            </button>
                          )}
                        </div>
                        <button
                          className="hero-explore"
                          onClick={() => changeMode("parts")}
                        >
                          {t("探索部件与系统", "EXPLORE PARTS & SYSTEMS")}
                          <ArrowUpRight size={18} />
                        </button>
                        <div className="hero-subnav">
                          {availableModes.includes("systems") && (
                            <button onClick={() => changeMode("systems")}>
                              {t("工作原理", "HOW IT WORKS")}
                            </button>
                          )}
                          <button onClick={() => changeMode("learn")}>
                            {t("学习路径", "LEARN")}
                          </button>
                          <button onClick={() => changeMode("quiz")}>
                            {t("知识检验", "QUIZ")}
                          </button>
                          <button onClick={() => changeMode("sources")}>
                            {t("来源与边界", "EVIDENCE")}
                          </button>
                        </div>
                        <p className="hero-boundary">
                          {t(
                            "公开连杆模型，不代表完整内部拆解。",
                            "Published link models, not a complete internal teardown.",
                          )}
                        </p>
                      </section>
                    )}
                    <RobotViewer
                      key={robot.id}
                      url={robot.urdfUrl}
                      lang={lang}
                      selected={selected}
                      highlighted={highlighted}
                      focusToken={focusToken}
                      viewToken={viewToken}
                      hidden={
                        groupedDisplay.robotId === robot.id &&
                        groupedDisplay.enabled &&
                        mode === "parts"
                          ? [
                              ...new Set([
                                ...hidden,
                                ...groupedDisplay.hiddenInstanceIds,
                              ]),
                            ]
                          : hidden
                      }
                      jointValues={jointValues}
                      ignoreJointLimits={
                        mode === "program" && programMode === "dynamics"
                      }
                      explode={explode}
                      view={view}
                      resetToken={resetToken}
                      onSelect={(part) => {
                        setHighlighted([]);
                        setSelected(part);
                        if (part) setBriefing(false);
                      }}
                      onLoaded={(newInfo) => {
                        if (activeRobotId.current === robot.id)
                          onLoaded(newInfo);
                      }}
                    />
                    {mode === "assembly" &&
                      !(robot.id === "so101" && assemblyView === "physical") &&
                      info.parts.length > 0 &&
                      hidden.length === info.parts.length && (
                        <div className="chain-empty-stage">
                          <Workflow size={28} />
                          <strong>
                            {t(
                              "从基座开始，重建运动链",
                              "Start at the base. Rebuild the chain.",
                            )}
                          </strong>
                          <span>
                            {t(
                              "在右侧选择并连接第一个步骤",
                              "Connect the first step in the panel",
                            )}
                          </span>
                        </div>
                      )}
                    <div className="stage-bottom">
                      <div className="view-controls">
                        {[
                          ["hero", "立体", "3D"],
                          ["front", "正面", "Front"],
                          ["side", "侧面", "Side"],
                          ["back", "背面", "Back"],
                          ["top", "顶部", "Top"],
                          ["iso", "等轴", "Iso"],
                        ].map(([id, zh, en]) => (
                          <button
                            key={id}
                            className={view === id ? "active" : ""}
                            onClick={() => {
                              setView(id as NavigationView);
                              setViewToken((value) => value + 1);
                            }}
                          >
                            {t(zh, en)}
                          </button>
                        ))}
                      </div>
                      <button
                        className="reset-button reload-model"
                        onClick={() => setResetToken((v) => v + 1)}
                      >
                        {t("重新加载", "Reload model")}
                      </button>
                      <button className="reset-button" onClick={reset}>
                        <RotateCcw size={14} />
                        {t("复位", "Reset")}
                      </button>
                    </div>
                    {!briefing && mode === "parts" && (
                      <div className="stage-separation">
                        <button onClick={animateSeparation}>
                          <Layers3 size={16} />
                          {explode > 0.05
                            ? t("合拢模型", "Reassemble view")
                            : t("拆分观察", "Separate parts")}
                        </button>
                        <span>
                          {t(
                            "空间分离演示 · 非维修步骤",
                            "SPATIAL SEPARATION · NOT SERVICE INSTRUCTIONS",
                          )}
                        </span>
                      </div>
                    )}
                    <div className="axis">
                      <b>Z</b>
                      <span>Y</span>
                      <em>X</em>
                    </div>
                  </div>
                  <div className="stage-caption">
                    <span>
                      <MousePointer2 size={13} />
                      {t(
                        "拖动旋转 · 滚轮缩放 · 点击选择部件",
                        "Drag to orbit · Scroll to zoom · Click a link",
                      )}
                    </span>
                    <button onClick={() => setResetToken((v) => v + 1)}>
                      {t("重新加载", "Reload model")}
                    </button>
                  </div>
                  <div className="model-summary">
                    <div>
                      <span className="eyebrow">
                        01 / {t("模型说明", "MODEL NOTES")}
                      </span>
                      <p>{robot.description[lang]}</p>
                    </div>
                    <div className="metric">
                      <strong>{info.parts.length || "—"}</strong>
                      <small>{t("描述链接", "URDF LINKS")}</small>
                    </div>
                    <div className="metric">
                      <strong>{info.joints.length || "—"}</strong>
                      <small>{t("独立控制关节", "INDEPENDENT CONTROLS")}</small>
                    </div>
                  </div>
                  <div className="truth-note">
                    <ShieldCheck size={17} />
                    <span>
                      {t(
                        "这里展示公开模型的连杆与关节，不等同于完整内部拆解或实机验证。",
                        "This shows published links and joints, not complete internal teardown or physical validation.",
                      )}
                    </span>
                    <button onClick={() => changeMode("sources")}>
                      {t("查看证据", "View evidence")}{" "}
                      <ArrowUpRight size={13} />
                    </button>
                  </div>
                </div>
                <aside className="inspector">
                  <div className="inspector-top">
                    <span>{t("探索工作台", "EXPLORATION WORKSPACE")}</span>
                    <button
                      onClick={() => {
                        showBriefing();
                      }}
                      aria-label={t("返回展厅", "Back to showroom")}
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <div
                    className="workspace-games"
                    aria-label={t("互动玩法", "Interactive games")}
                  >
                    {supportsRobotDrive(robot) && (
                      <button
                        data-testid="workspace-game-drive"
                        onClick={() => startGame("drive")}
                      >
                        <Play size={15} /> {t("游戏试驾", "Driving game")}
                      </button>
                    )}
                    <button
                      data-testid="workspace-game-build"
                      onClick={() => startGame("build")}
                    >
                      <Wrench size={15} /> {t("装配挑战", "Assembly challenge")}
                    </button>
                  </div>
                  <div className="mode-tabs">
                    {tabs
                      .filter((tab) => availableModes.includes(tab.id))
                      .map((tab) => (
                        <button
                          title={t(tab.zh, tab.en)}
                          key={tab.id}
                          onClick={() => {
                            stop();
                            changeMode(tab.id);
                          }}
                          className={mode === tab.id ? "active" : ""}
                        >
                          <tab.icon size={17} />
                          <span>{t(tab.zh, tab.en)}</span>
                        </button>
                      ))}
                  </div>
                  <div className="panel-content">
                    <ExplorationTaskPanel
                      key={`${robot.id}:${robot.sourceCommit}`}
                      robot={robot}
                      info={info}
                      lang={lang}
                      selected={selected}
                      jointValues={jointValues}
                      mode={mode}
                      onMode={(next) => changeMode(next)}
                      onStartResetSelection={() => {
                        setSelected(null);
                        setHighlighted([]);
                      }}
                    />
                    {mode === "parts" && (
                      <>
                        <div className="panel-title">
                          <div>
                            <span className="eyebrow">STRUCTURE EXPLORER</span>
                            <h3>
                              {t(
                                "从整机，到每一环。",
                                "From the whole to each link.",
                              )}
                            </h3>
                          </div>
                          <span className="count-badge">
                            {info.parts.length}
                          </span>
                        </div>
                        <GroupedPartsPanel
                          robot={robot}
                          lang={lang}
                          selected={selected}
                          grouped={
                            groupedDisplay.robotId === robot.id &&
                            groupedDisplay.enabled
                          }
                          onDisplayChange={(display) => {
                            if (display.robotId === robot.id) {
                              stop();
                              setGroupedDisplay(display);
                              if (display.enabled) setExplode(1);
                            }
                          }}
                          onSelect={(id) => {
                            stop();
                            setSelected(id);
                            setHighlighted([id]);
                            setHidden((v) => v.filter((x) => x !== id));
                            setFocusToken((v) => v + 1);
                          }}
                          onEvidence={(evidence) => {
                            if (!evidence)
                              setGroupedDisplay({
                                robotId: robot.id,
                                enabled: false,
                                hiddenInstanceIds: [],
                              });
                          }}
                        />
                        <StructureNavigator
                          robot={robot}
                          lang={lang}
                          selected={selected}
                          hidden={hidden}
                          onSelect={(part) => {
                            stop();
                            setSelected(part);
                            setHighlighted([]);
                            setHidden((items) =>
                              items.filter((id) => id !== part),
                            );
                          }}
                          onBranch={(ids, action) => {
                            stop();
                            setSelected(ids[0] || null);
                            setHighlighted(ids);
                            setHidden(
                              action === "isolate"
                                ? info.parts.filter((id) => !ids.includes(id))
                                : hidden.filter((id) => !ids.includes(id)),
                            );
                            if (action === "focus" || action === "isolate")
                              setFocusToken((v) => v + 1);
                          }}
                          onRestore={() => {
                            stop();
                            setHidden([]);
                            setHighlighted([]);
                            setSelected(null);
                            setExplode(0);
                            setView("hero");
                            setViewToken((v) => v + 1);
                          }}
                          onLesson={(id) => {
                            changeMode("systems");
                            setLessonId(id);
                          }}
                          onAssemble={(context) => {
                            if (context.robotId !== robot.id) return;
                            stop();
                            setAssemblyFromExplore(true);
                            setAssemblyContextPart(context.partId);
                            setExperience("build");
                          }}
                        />
                        {selected && (
                          <div className="selection-card">
                            <div>
                              <Box size={15} />
                              <strong>{selected}</strong>
                              <button
                                aria-label="Clear selection"
                                onClick={() => {
                                  setSelected(null);
                                  setHighlighted([]);
                                }}
                              >
                                <X size={14} />
                              </button>
                            </div>
                            <p>
                              {t(
                                "官方模型中的独立连杆。部件名称保留源文件命名，避免将连杆误称为已验证的内部零件。",
                                "An independent link in the official model. Source names are preserved; a link is not a verified internal component.",
                              )}
                            </p>
                            <button
                              className="text-button"
                              onClick={() =>
                                setHidden(
                                  info.parts.filter((p) => p !== selected),
                                )
                              }
                            >
                              {t("仅显示此连杆", "Isolate this link")}
                            </button>
                            <button
                              className="text-button"
                              onClick={() => setHidden([])}
                            >
                              {t("显示全部", "Show all")}
                            </button>
                            <button
                              className="text-button"
                              onClick={() => {
                                setHighlighted([]);
                                setFocusToken((value) => value + 1);
                              }}
                            >
                              <Focus size={12} />
                              {t("聚焦此连杆", "Focus link")}
                            </button>
                            <PartEvidencePanel
                              robot={robot}
                              part={selected}
                              lang={lang}
                              onSelect={(part) => {
                                setSelected(part);
                                setHidden([]);
                                setHighlighted([]);
                                setFocusToken((value) => value + 1);
                              }}
                              onLesson={(id) => {
                                changeMode("systems");
                                setLessonId(id);
                              }}
                            />
                          </div>
                        )}
                        <details className="quick-parts" open>
                          <summary>
                            {t("快速零件列表", "Quick link list")}
                          </summary>
                          <label className="search">
                            <Search size={15} />
                            <input
                              value={search}
                              onChange={(e) => setSearch(e.target.value)}
                              placeholder={t("搜索连杆名称…", "Find a link…")}
                            />
                          </label>
                          <div className="part-list">
                            {filteredParts.map((part, i) => (
                              <div
                                key={part}
                                className={`part-row ${selected === part ? "selected" : ""}`}
                              >
                                <button
                                  onClick={() => {
                                    setSelected(
                                      selected === part ? null : part,
                                    );
                                    setHighlighted([]);
                                  }}
                                >
                                  <span>{String(i + 1).padStart(2, "0")}</span>
                                  <Box size={14} />
                                  <strong>{part}</strong>
                                </button>
                                <button
                                  className="visibility-button"
                                  aria-label={`${t("显隐", "Toggle visibility")} ${part}`}
                                  onClick={() => toggleHidden(part)}
                                >
                                  {hidden.includes(part) ? (
                                    <EyeOff size={15} />
                                  ) : (
                                    <Eye size={15} />
                                  )}
                                </button>
                              </div>
                            ))}
                            {!filteredParts.length && (
                              <p className="muted">
                                {t("没有匹配部件", "No matching links")}
                              </p>
                            )}
                          </div>
                        </details>
                        <div className="explode-control">
                          <div>
                            <label htmlFor="explode">
                              {t("结构分离视图", "Structure separation")}
                            </label>
                            <b>{Math.round(explode * 100)}%</b>
                          </div>
                          <input
                            id="explode"
                            type="range"
                            min="0"
                            max="1"
                            step=".01"
                            value={explode}
                            onChange={(e) => {
                              stop();
                              setExplode(Number(e.target.value));
                            }}
                          />
                          <small>
                            {t(
                              "空间观察辅助，不是经过核验的维修拆装步骤。",
                              "Spatial inspection aid, not a validated disassembly procedure.",
                            )}
                          </small>
                        </div>
                      </>
                    )}
                    {mode === "systems" && (
                      <StructureLessonsPanel
                        key={`${robot.id}:${info.parts.length}`}
                        robotId={robot.id}
                        revision={robot.sourceCommit || "unknown"}
                        lang={lang}
                        onInspect={inspectMechanism}
                        onRestore={restoreObservation}
                        lessonId={lessonId}
                        onLessonChange={setLessonId}
                      />
                    )}
                    {mode === "hand" && handDefinition && (
                      <HandLabPanel
                        robot={robot}
                        lang={lang}
                        info={info}
                        definition={handDefinition}
                        values={jointValues}
                        onPose={(values) => {
                          stop();
                          setExplode(0);
                          setJointValues(values);
                        }}
                        onHighlight={(ids, focus) => {
                          setHighlighted(ids);
                          setSelected(ids[0] || "");
                          setHidden([]);
                          if (focus) setFocusToken((v) => v + 1);
                        }}
                        onStop={stop}
                      />
                    )}
                    {mode === "gripper" && robot.id === "franka-hand" && (
                      <GripperLabPanel
                        key={robot.id}
                        lang={lang}
                        info={info}
                        values={jointValues}
                        onPose={(values) => {
                          stop();
                          setExplode(0);
                          setJointValues(values);
                        }}
                        onHighlight={(ids, focus) => {
                          setSelected(ids[0] || "");
                          setHighlighted(ids);
                          setHidden([]);
                          if (focus) setFocusToken((v) => v + 1);
                        }}
                        onStop={stop}
                      />
                    )}
                    {mode === "buildkit" &&
                      (robot.id === "open-duck-mini" ? (
                        <MakerProjects lang={lang} projectId="open-duck-mini" />
                      ) : (
                        <BuildKitPanel lang={lang} robotId={robot.id} />
                      ))}
                    {mode === "assembly" && (
                      <>
                        {robot.id === "so101" && (
                          <div
                            className="program-mode-switch assembly-learning-switch"
                            aria-label={t(
                              "装配学习方式",
                              "Assembly learning mode",
                            )}
                          >
                            <button
                              className={
                                assemblyView === "chain" ? "active" : ""
                              }
                              aria-pressed={assemblyView === "chain"}
                              data-testid="assembly-chain-tab"
                              onClick={() => {
                                setAssemblyView("chain");
                                setSelected(null);
                                setHighlighted([]);
                                setHidden([]);
                                setExplode(0);
                              }}
                            >
                              {t("运动链重建", "Kinematic chain")}
                            </button>
                            <button
                              className={
                                assemblyView === "physical" ? "active" : ""
                              }
                              aria-pressed={assemblyView === "physical"}
                              data-testid="assembly-reading-tab"
                              onClick={() => {
                                setAssemblyView("physical");
                                setSelected(null);
                                setHighlighted([]);
                                setHidden([]);
                                setExplode(0);
                                setJointValues({});
                              }}
                            >
                              {t("官方装配阅读", "Official assembly reading")}
                            </button>
                          </div>
                        )}
                        {robot.id === "so101" && assemblyView === "physical" ? (
                          <PhysicalAssemblyPanel
                            key={`physical:${robot.id}:${info.parts.length}`}
                            lang={lang}
                            onObserve={(parts) =>
                              inspectMechanism(parts, false)
                            }
                          />
                        ) : (
                          <AssemblyPanel
                            key={`${robot.id}:${info.parts.length}`}
                            robotId={robot.id}
                            revision={robot.sourceCommit || "unknown"}
                            lang={lang}
                            onReveal={revealChain}
                          />
                        )}
                      </>
                    )}
                    {mode === "joints" && (
                      <>
                        <DirectMotionPanel
                          key={`${robot.id}-${motionReset}`}
                          robotId={robot.id}
                          lang={lang}
                          joints={info.joints}
                          onStop={stop}
                          onPose={(values) => {
                            setExplode(0);
                            setJointValues(values);
                          }}
                        />
                        <div className="panel-title">
                          <div>
                            <span className="eyebrow">
                              KINEMATICS PLAYGROUND
                            </span>
                            <h3>
                              {t(
                                "让结构动起来。",
                                "Put the mechanism in motion.",
                              )}
                            </h3>
                          </div>
                        </div>
                        <p className="panel-intro">
                          {t(
                            "每个滑块都作用于真实 URDF 关节。按源轴线运动；耦合手部使用同时满足从关节限位的有效驱动范围。不计算力、接触或稳定性。",
                            "Each control drives a real URDF joint on its source axis. Coupled hands use effective drive ranges that also respect follower limits. Forces, contacts and stability are not simulated.",
                          )}
                        </p>
                        <div className="joint-list">
                          {info.joints.map((source) => {
                            const j =
                              handDefinition &&
                              handDefinition.joints.some(
                                (h) => h.name === source.name && !h.mimic,
                              )
                                ? {
                                    ...source,
                                    ...handDriveLimits(
                                      handDefinition,
                                      source.name,
                                    ),
                                  }
                                : source;
                            return (
                              <div className="joint-control" key={j.name}>
                                <div>
                                  <label htmlFor={j.name}>{j.name}</label>
                                  <b>
                                    {(
                                      jointValues[j.name] ??
                                      Math.min(j.upper, Math.max(j.lower, 0))
                                    ).toFixed(2)}{" "}
                                    <small>
                                      {j.type === "prismatic" ? "m" : "rad"}
                                    </small>
                                  </b>
                                </div>
                                <input
                                  id={j.name}
                                  type="range"
                                  min={j.lower}
                                  max={j.upper}
                                  step={j.type === "prismatic" ? ".001" : ".01"}
                                  value={
                                    jointValues[j.name] ??
                                    Math.min(j.upper, Math.max(j.lower, 0))
                                  }
                                  onChange={(e) =>
                                    setJoint(j, Number(e.target.value))
                                  }
                                />
                                <footer>
                                  <span>{j.lower.toFixed(2)}</span>
                                  <span>{j.type}</span>
                                  <span>{j.upper.toFixed(2)}</span>
                                </footer>
                              </div>
                            );
                          })}
                        </div>
                        <button className="secondary wide" onClick={reset}>
                          <RotateCcw size={15} />
                          {t("关节复位（限位内）", "Reset all joints")}
                        </button>
                      </>
                    )}
                    {mode === "learn" && (
                      <>
                        <div className="panel-title">
                          <div>
                            <span className="eyebrow">LEARN BY EXPLORING</span>
                            <h3>
                              {t(
                                "理解，比记住重要。",
                                "Understanding over memorizing.",
                              )}
                            </h3>
                          </div>
                        </div>
                        <div className="progress-label">
                          <span>{t("阅读进度", "Reading progress")}</span>
                          <b>
                            {completed.length} / {lessons.length}
                          </b>
                        </div>
                        <div className="progress-track">
                          <i
                            style={{
                              width: `${(completed.length / Math.max(lessons.length, 1)) * 100}%`,
                            }}
                          />
                        </div>
                        <div className="lesson-picker">
                          {lessons.map((l, i) => (
                            <button
                              key={l.id}
                              onClick={() => setLessonId(l.id)}
                              className={lessonId === l.id ? "active" : ""}
                            >
                              <span>
                                {completed.includes(l.id) ? (
                                  <Check size={13} />
                                ) : (
                                  String(i + 1).padStart(2, "0")
                                )}
                              </span>
                              {l.title[lang]}
                              <ChevronRight size={13} />
                            </button>
                          ))}
                        </div>
                        {activeLesson && (
                          <article className="lesson-article">
                            <h3>{activeLesson.title[lang]}</h3>
                            <p>{activeLesson.summary[lang]}</p>
                            <div className="lesson-body">
                              {activeLesson.body[lang]}
                            </div>
                            <div className="try-card">
                              <Sparkles size={16} />
                              <div>
                                <strong>{t("现在试一试", "Try it now")}</strong>
                                <p>{activeLesson.task[lang]}</p>
                              </div>
                            </div>
                            <a
                              href={activeLesson.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {t("阅读一手资料", "Read the primary source")} ↗
                            </a>
                            <button
                              className="primary wide"
                              onClick={() =>
                                setCompleted((v) =>
                                  v.includes(activeLesson.id)
                                    ? v
                                    : [...v, activeLesson.id],
                                )
                              }
                            >
                              <Check size={15} />
                              {completed.includes(activeLesson.id)
                                ? t("已读", "Read")
                                : t("标记已读", "Mark as read")}
                            </button>
                          </article>
                        )}
                      </>
                    )}
                    {mode === "quiz" && (
                      <>
                        <div className="panel-title">
                          <div>
                            <span className="eyebrow">
                              CHECK YOUR UNDERSTANDING
                            </span>
                            <h3>
                              {t(
                                "把发现，变成知识。",
                                "Turn discoveries into knowledge.",
                              )}
                            </h3>
                          </div>
                        </div>
                        <div className="score">
                          {
                            Object.entries(answers).filter(
                              ([id, a]) =>
                                questions.find((q) => q.id === id)?.answer ===
                                a,
                            ).length
                          }
                          <small>
                            {" "}
                            / {questions.length} {t("答对", "correct")}
                          </small>
                        </div>
                        {questions.map((q, i) => (
                          <div className="question" key={q.id}>
                            <h4>
                              <span>{String(i + 1).padStart(2, "0")}</span>
                              {q.prompt[lang]}
                            </h4>
                            {q.options.map((o, index) => (
                              <button
                                key={index}
                                className={
                                  answers[q.id] === index
                                    ? q.answer === index
                                      ? "correct"
                                      : "incorrect"
                                    : ""
                                }
                                onClick={() =>
                                  setAnswers((v) => ({ ...v, [q.id]: index }))
                                }
                              >
                                <span>{String.fromCharCode(65 + index)}</span>
                                {o[lang]}
                              </button>
                            ))}
                            {answers[q.id] !== undefined && (
                              <p className="answer-explanation">
                                {answers[q.id] === q.answer ? "✓" : "↳"}{" "}
                                {q.explanation[lang]}
                              </p>
                            )}
                          </div>
                        ))}
                        <button
                          className="secondary wide"
                          onClick={() => setAnswers({})}
                        >
                          {t("重新测验", "Try again")}
                        </button>
                      </>
                    )}
                    {mode === "program" && (
                      <>
                        <div className="panel-title">
                          <div>
                            <span className="eyebrow">
                              JOINT MOTION WORKBENCH
                            </span>
                            <h3>
                              {t(
                                "写下动作，看见变化。",
                                "Write motion. See it happen.",
                              )}
                            </h3>
                          </div>
                        </div>
                        <div className="program-mode-switch">
                          <button
                            className={
                              programMode === "kinematic" ? "active" : ""
                            }
                            onClick={() => {
                              stop();
                              setProgramMode("kinematic");
                            }}
                          >
                            {t("运动学程序", "Kinematic program")}
                          </button>
                          {supportsRobotDynamics(robot.id) && (
                            <button
                              className={
                                programMode === "dynamics" ? "active" : ""
                              }
                              onClick={() => {
                                stop();
                                setExplode(0);
                                setProgramMode("dynamics");
                              }}
                            >
                              {t("真实动力学", "Real dynamics")}
                            </button>
                          )}
                        </div>
                        {programMode === "dynamics" ? (
                          <DynamicsPanel
                            key={robot.id}
                            lang={lang}
                            robotId={robot.id}
                            onState={setJointValues}
                          />
                        ) : (
                          <>
                            <p className="panel-intro">
                              {t(
                                "编辑 JSON 关键帧，驱动当前模型的真实关节。时间为秒，旋转为弧度。运行结果来自插值运动学，不是 SDK、动力学或实体硬件。",
                                "Edit JSON keyframes to drive actual model joints. Time is seconds; rotation is radians. Execution is interpolated kinematics, not an SDK, dynamics or physical hardware.",
                              )}
                            </p>
                            <textarea
                              aria-label={t("运动程序", "Motion program")}
                              spellCheck={false}
                              className="code-editor"
                              value={program}
                              onChange={(e) => {
                                stop();
                                setProgram(e.target.value);
                              }}
                            />
                            <div className="program-toolbar">
                              <button
                                className="primary"
                                onClick={running ? stop : runProgram}
                              >
                                {running ? (
                                  <Pause size={15} />
                                ) : (
                                  <Play size={15} />
                                )}{" "}
                                {running
                                  ? t("停止", "Stop")
                                  : t("运行程序", "Run program")}
                              </button>
                              <span className={running ? "running" : ""}>
                                {runTime.toFixed(2)} s
                              </span>
                              <button
                                className="icon-button"
                                title={t("导出实验", "Export experiment")}
                                onClick={() =>
                                  download(`${robot.id}-experiment.json`, {
                                    schemaVersion: 1,
                                    robotId: robot.id,
                                    sourceCommit: robot.sourceCommit,
                                    urdfUrl: robot.urdfUrl,
                                    program,
                                    trace,
                                  })
                                }
                              >
                                <Download size={16} />
                              </button>
                            </div>
                            <button
                              className="secondary wide"
                              disabled={!info.joints.length}
                              onClick={() => {
                                try {
                                  download(
                                    experimentTemplateFilename(robot),
                                    createExperimentTemplate(
                                      robot,
                                      info.joints,
                                    ),
                                  );
                                  setProgramError("");
                                } catch (error) {
                                  setProgramError(
                                    error instanceof Error
                                      ? error.message
                                      : String(error),
                                  );
                                }
                              }}
                            >
                              <Download size={14} />{" "}
                              {t("下载当前机型模板", "Download robot template")}
                            </button>
                            <details className="experiment-format">
                              <summary>
                                {t(
                                  "实验包格式与使用",
                                  "Experiment format and usage",
                                )}
                              </summary>
                              <p>
                                {t(
                                  "下载模板 → 修改 program 字符串中的关键帧 → 导入 → 检查后运行。导入不会自动执行。模板绑定当前机型与源版本，不能直接换机型使用。",
                                  "Download a template → edit keyframes inside the program string → import → review and run. Import never runs automatically. Templates are tied to their robot and source revision.",
                                )}
                              </p>
                              <p>
                                {t(
                                  "外层字段：schemaVersion=1、robotId、sourceCommit、program（JSON 字符串）。frames 包含 time 和 joints；2–100 帧，从 0 秒递增，最长 60 秒。旋转用弧度，移动用米，只接受模型独立关节及有效限位。",
                                  "Package fields: schemaVersion=1, robotId, sourceCommit and program (a JSON string). frames contain time and joints: 2–100 frames, increasing from 0, at most 60 seconds. Radians for rotation and metres for translation; only source independent joints within effective limits.",
                                )}
                              </p>
                            </details>
                            <label className="import-experiment secondary wide">
                              <Upload size={14} />{" "}
                              {t("导入实验包", "Import experiment")}
                              <input
                                type="file"
                                accept="application/json,.json"
                                onChange={(event) => {
                                  void importExperiment(
                                    event.target.files?.[0],
                                  );
                                  event.target.value = "";
                                }}
                              />
                            </label>
                            {programError && (
                              <div className="error-message" role="alert">
                                {programError}
                              </div>
                            )}
                            <div className="trace-panel">
                              <div>
                                <span className="eyebrow">
                                  {t("执行记录", "EXECUTION TRACE")}
                                </span>
                                <b>
                                  {trace.length} {t("采样", "samples")}
                                </b>
                              </div>
                              {trace.length ? (
                                <>
                                  <div className="trace-chart">
                                    {trace.slice(-50).map((point, i) => (
                                      <i
                                        key={i}
                                        style={{
                                          height: `${Math.min(100, 15 + Math.abs(Object.values(point.values)[0] || 0) * 180)}%`,
                                        }}
                                      />
                                    ))}
                                  </div>
                                  <pre>
                                    {JSON.stringify(trace.at(-1), null, 2)}
                                  </pre>
                                </>
                              ) : (
                                <p>
                                  {t(
                                    "运行后记录关节目标与时间戳。",
                                    "Run a program to record joint targets and timestamps.",
                                  )}
                                </p>
                              )}
                            </div>
                            <div className="notice">
                              {t(
                                "尚未支持：真实 SDK / ROS 2 执行、板卡电路仿真、动力学和真实调试器。它们不以假日志或预设动画替代。",
                                "Not yet supported: SDK / ROS 2 execution, circuit simulation, dynamics or real debuggers. These are not replaced with fake logs or canned animation.",
                              )}
                            </div>
                          </>
                        )}
                      </>
                    )}
                    {mode === "sources" && (
                      <>
                        <div className="panel-title">
                          <div>
                            <span className="eyebrow">
                              PROVENANCE & BOUNDARIES
                            </span>
                            <h3>
                              {t(
                                "每一个模型，有据可查。",
                                "Every model has a source.",
                              )}
                            </h3>
                          </div>
                          <ShieldCheck size={25} />
                        </div>
                        <div className="evidence-card">
                          <h4>{t("来源", "Source")}</h4>
                          <a
                            href={robot.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {robot.manufacturer} ·{" "}
                            {t("官方仓库", "official repository")}{" "}
                            <ArrowUpRight size={14} />
                          </a>
                          <p>{robot.sourceUrl}</p>
                        </div>
                        <div className="evidence-card">
                          <h4>
                            {t(
                              "固定版本与分发声明",
                              "Pinned revision & notices",
                            )}
                          </h4>
                          <p className="source-commit">
                            {robot.sourceCommit || t("未记录", "Not recorded")}
                          </p>
                          {robot.provenanceUrl && (
                            <a
                              href={siteAsset(robot.provenanceUrl)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {t(
                                "逐文件来源与校验值",
                                "Per-file provenance and checksums",
                              )}{" "}
                              ↗
                            </a>
                          )}
                          <a
                            href={siteAsset(`/robots/${robot.id}/LICENSE.txt`)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            LICENSE ↗
                          </a>
                          {robot.sourceDownloadUrl && (
                            <a
                              href={siteAsset(robot.sourceDownloadUrl)}
                              download
                            >
                              {t(
                                "完整对应模型源码 ↓",
                                "Corresponding model source ↓",
                              )}
                            </a>
                          )}
                          {robot.noticeUrl && (
                            <a
                              href={siteAsset(robot.noticeUrl)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              NOTICE ↗
                            </a>
                          )}
                        </div>
                        <div className="evidence-card">
                          <h4>{t("已知覆盖范围", "Verified scope")}</h4>
                          <p>{robot.verifiedScope[lang]}</p>
                        </div>
                        <div className="evidence-card warning">
                          <h4>{t("未知与限制", "Unknowns & limitations")}</h4>
                          <p>{robot.limitations[lang]}</p>
                        </div>
                        <div className="evidence-card">
                          <h4>{t("资产许可", "Asset license")}</h4>
                          <p>{robot.license}</p>
                        </div>
                        <div className="notice">
                          {t(
                            "模型中的连杆数量不等于真实零件数量，可动关节数也不应跨配置当成厂商规格。完整内部深拆需要额外的 CAD、维修或实物证据。",
                            "Link counts are not physical part counts. Movable joints are configuration-specific, not interchangeable product specifications. Full internal teardown needs additional CAD, service or physical evidence.",
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </aside>
              </main>
            </>
          )}
          {page === "catalog" && (
            <main className="library-page">
              <div className="section-heading">
                <div>
                  <div className="eyebrow">ROBOT FIELD GUIDE</div>
                  <h1>
                    {t(
                      "不同结构，同样值得探索。",
                      "Different structures. Equal curiosity.",
                    )}
                  </h1>
                </div>
                <p>
                  {t(
                    "只有有来源的模型，才进入实验室。",
                    "Only sourced models enter the laboratory.",
                  )}
                </p>
              </div>
              <div className="catalog-filters">
                <button
                  className={formFilter === "all" ? "active" : ""}
                  onClick={() => setFormFilter("all")}
                >
                  {t("全部机型", "All robots")}
                </button>
                {[...new Set(robots.map((r) => r.form))].map((form) => (
                  <button
                    key={formLabel(form)}
                    className={formFilter === form ? "active" : ""}
                    onClick={() => setFormFilter(form)}
                  >
                    {formLabel(form)}
                  </button>
                ))}
              </div>
              <div className="catalog-grid">
                {robots
                  .filter((r) => formFilter === "all" || r.form === formFilter)
                  .map((r, i) => (
                    <article key={r.id}>
                      <div className="catalog-visual">
                        <span className="catalog-index">0{i + 1}</span>
                        <img
                          src={siteAsset(`/previews/${r.id}.png`)}
                          alt={r.name[lang]}
                        />
                        <span>{r.manufacturer.toUpperCase()}</span>
                      </div>
                      <div className="catalog-copy">
                        <span className="eyebrow">{formLabel(r.form)}</span>
                        <h2>{r.name[lang]}</h2>
                        <p>{r.description[lang]}</p>
                        <button
                          className="primary"
                          onClick={() => switchRobot(r.id)}
                        >
                          {t("进入实验室", "Enter laboratory")}
                          <ArrowUpRight size={16} />
                        </button>
                      </div>
                    </article>
                  ))}
              </div>
              <section
                className="catalog-research"
                aria-label={t("行业资料机型", "Industry research robots")}
              >
                <h2>{t("行业资料机型", "Industry research robots")}</h2>
                <p>
                  {t(
                    "官方资料入口，不冒充可操作3D模型。",
                    "Official-source entries, not pretend interactive 3D models.",
                  )}
                </p>
                <div className="industry-links">
                  {industryResearch.map((card) => (
                    <article key={card.id}>
                      <h3>{card.name[lang]}</h3>
                      <p>{card.status[lang]}</p>
                      <a
                        href={card.sources[0].url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {t("官方资料 ↗", "Official source ↗")}
                      </a>
                    </article>
                  ))}
                </div>
              </section>
              <div className="notice">
                {t(
                  "14 款本地模型可进入实验室；Microduck 为官方外部体验。",
                  "14 local models open in the laboratory; Microduck opens an official external experience.",
                )}
              </div>
            </main>
          )}
          {page === "makers" && (
            <main className="catalog-page">
              <MakerProjects lang={lang} />
            </main>
          )}
          {page === "compare" && (
            <CompareExperience
              robots={robots}
              lang={lang}
              onExplore={(id) => {
                setBriefing(false);
                setMode("parts");
                switchRobot(id);
              }}
            />
          )}
        </>
      )}
      <footer className="footer">
        <span>ROBOT RADAR / 2026</span>
        <p>
          {t("保持好奇，尊重证据。", "Stay curious. Respect the evidence.")}
        </p>
        <span>
          {t(
            "具身智能学习站 · 来源可追溯",
            "EMBODIED LEARNING · TRACEABLE SOURCES",
          )}
        </span>
      </footer>
    </div>
  );
}
