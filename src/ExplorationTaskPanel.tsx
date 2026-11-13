import { useEffect, useRef, useState } from "react";
import type { Lang, ModelInfo, RobotEntry } from "./types";
import { siteAsset } from "./siteAssets";
import {
  createExplorationTask,
  idleExploration,
  startExploration,
  observeExploration,
  restoreExploration,
  serializeExploration,
  type ExplorationTask,
  type TaskSession,
} from "./core/explorationTask";
import "./styles/explorationTask.css";
export type ExplorationTaskPanelProps = {
  robot: RobotEntry;
  info: ModelInfo;
  lang: Lang;
  selected: string | null;
  jointValues: Record<string, number>;
  mode: string;
  onMode: (mode: "parts" | "joints") => void;
  /** Clear only stale link selection before a new attempt; never move a joint. */
  onStartResetSelection?: () => void;
};
export default function ExplorationTaskPanel({
  robot,
  info,
  lang,
  selected,
  jointValues,
  mode,
  onMode,
  onStartResetSelection,
}: ExplorationTaskPanelProps) {
  const t = (zh: string, en: string) => (lang === "zh" ? zh : en);
  const root = useRef<HTMLElement>(null);
  const guideFrame = useRef(0);
  const guidedControl = useRef<HTMLElement | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [task, setTask] = useState<ExplorationTask | null>(null),
    [session, setSession] = useState<TaskSession | null>(null),
    [error, setError] = useState(false),
    [loading, setLoading] = useState(true),
    [storage, setStorage] = useState(true);
  const signature = JSON.stringify({
    parts: info.parts,
    joints: info.joints.map(({ name, type, lower, upper }) => ({
      name,
      type,
      lower,
      upper,
    })),
  });
  const savedSession = useRef<string | null>(null);
  useEffect(() => {
    let active = true;
    const abort = new AbortController();
    setTask(null);
    setSession(null);
    setError(false);
    setLoading(true);
    setDismissed(false);
    savedSession.current = null;
    (async () => {
      try {
        const response = await fetch(siteAsset(robot.urdfUrl), {
          signal: abort.signal,
        });
        if (!response.ok) throw Error("Source unavailable");
        const xml = await response.text();
        const hash = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(xml),
        );
        const digest = Array.from(new Uint8Array(hash), (v) =>
          v.toString(16).padStart(2, "0"),
        ).join("");
        const next = createExplorationTask(robot, info, xml, digest);
        if (!active) return;
        let restored = idleExploration(next);
        try {
          restored = restoreExploration(next, localStorage.getItem(next.key));
          setStorage(true);
        } catch {
          setStorage(false);
        }
        setTask(next);
        setSession(restored);
        setLoading(false);
      } catch {
        if (active) {
          setLoading(false);
          setError(true);
        }
      }
    })();
    return () => {
      active = false;
      abort.abort();
      cancelAnimationFrame(guideFrame.current);
      guidedControl.current?.classList.remove("task-guided-target");
    };
  }, [robot.id, robot.sourceCommit, robot.urdfUrl, signature]);
  const current = task ? (jointValues[task.joint] ?? 0) : 0;
  useEffect(() => {
    if (!task) return;
    setSession((previous) =>
      previous
        ? observeExploration(task, previous, { selected, value: current, mode })
        : previous,
    );
  }, [task, selected, current, mode]);
  useEffect(() => {
    if (!task || !session) return;
    const raw = serializeExploration(task, session);
    if (!raw || raw === savedSession.current) return;
    savedSession.current = raw;
    try {
      localStorage.setItem(task.key, raw);
      setStorage(true);
    } catch {
      setStorage(false);
    }
  }, [task, session]);
  const active = session && !["idle", "complete"].includes(session.phase);
  const compact = session?.phase === "complete" && mode !== "learn";
  if (mode !== "learn" && !active && session?.phase !== "complete") return null;
  if (compact && dismissed) return null;
  const start = () => {
    if (!task) return;
    setDismissed(false);
    onStartResetSelection?.();
    setSession(startExploration(task));
    savedSession.current = null;
    try {
      localStorage.removeItem(task.key);
    } catch {
      setStorage(false);
    }
    onMode("parts");
  };
  const phase = session?.phase || "idle",
    step = phase === "select" ? 1 : phase === "move" ? 2 : 3;
  const guide = () => {
    if (!task) return;
    onMode(phase === "select" ? "parts" : "joints");
    cancelAnimationFrame(guideFrame.current);
    guideFrame.current = requestAnimationFrame(() => {
      const panel = root.current?.closest(".panel-content");
      if (!panel) return;
      // Reveal and focus a real control; never select a link or move a joint for the learner.
      const row = Array.from(
        panel.querySelectorAll<HTMLElement>(".part-row"),
      ).find((node) => node.querySelector("strong")?.textContent === task.link);
      const control =
        phase === "select"
          ? row?.querySelector<HTMLButtonElement>("button")
          : Array.from(
              panel.querySelectorAll<HTMLInputElement>('input[type="range"]'),
            ).find((input) => input.id === task.joint);
      if (!control) return;
      for (
        let node: HTMLElement | null = control.parentElement;
        node && node !== panel;
        node = node.parentElement
      )
        if (node instanceof HTMLDetailsElement) node.open = true;
      guidedControl.current?.classList.remove("task-guided-target");
      guidedControl.current = control;
      control.classList.add("task-guided-target");
      control.focus({ preventScroll: true });
      control.scrollIntoView({ block: "center", behavior: "instant" });
    });
  };
  return (
    <section
      ref={root}
      className={`exploration-task ${active ? "is-active" : ""} ${compact ? "is-compact" : ""}`}
      data-testid="exploration-task"
      data-phase={phase}
      data-task-joint={task?.joint}
      data-task-parent={task?.parent}
      data-task-joint-type={task?.jointType}
      data-task-axis={
        task ? (task.axis ? JSON.stringify(task.axis) : "unknown") : undefined
      }
      data-task-link={task?.link}
      data-task-target={task?.target}
      data-task-neutral={task ? 0 : undefined}
      data-task-tolerance={task?.tolerance}
      data-task-unit={task?.unit}
      data-task-key={task?.key}
      data-task-current={current}
    >
      <header>
        <strong>{t("三步动手任务", "Three-step exploration task")}</strong>
        {active && <span>{step}/3</span>}
      </header>
      {(loading || error) && (
        <p role="status">
          {loading
            ? t("正在核对当前源模型…", "Checking the current source model…")
            : t(
                "源模型或有效关节映射无法核验，任务不可用。",
                "Source model or effective joint mapping could not be verified. Task unavailable.",
              )}
        </p>
      )}
      {task && session && (
        <>
          {!compact && (
            <details className="exploration-task-details">
              <summary>
                {t(
                  "查看模型关系与轴向说明",
                  "Model relationship and axis details",
                )}
              </summary>
              <p
                className="exploration-task-source"
                data-testid="exploration-task-source"
              >
                {task.axis
                  ? task.jointType === "prismatic"
                    ? t(
                        `观察 ${task.link} 相对父连杆 ${task.parent} 沿关节局部轴移动。`,
                        `Observe ${task.link} translating relative to parent ${task.parent} along the joint-local axis.`,
                      )
                    : t(
                        `观察 ${task.link} 相对父连杆 ${task.parent} 绕关节局部轴旋转。`,
                        `Observe ${task.link} rotating relative to parent ${task.parent} about the joint-local axis.`,
                      )
                  : t(
                      `源关节 ${task.joint} 连接父连杆 ${task.parent} 与子连杆 ${task.link}；源局部轴未声明或无效，无法核验具体轴向。`,
                      `Source joint ${task.joint} connects parent ${task.parent} to child ${task.link}; its local axis is missing or invalid, so its direction cannot be verified.`,
                    )}
                <br />
                {t("源关节类型", "Source joint type")}: {task.jointType} ·{" "}
                {t("源局部轴", "Source local axis")}:{" "}
                {task.axis
                  ? `[${task.axis.join(", ")}]`
                  : t("未知（未声明或无效）", "Unknown (missing or invalid)")}
                <small>
                  {t(
                    "轴向位于该关节的局部坐标系，不是屏幕或世界坐标方向；不据此推断内部传动或接触作用。",
                    "The axis is in the joint's local frame, not screen/world coordinates. It does not establish internal transmission or contact behavior.",
                  )}
                </small>
              </p>
            </details>
          )}
          {phase === "idle" || phase === "complete" ? (
            <>
              <p>
                {phase === "complete"
                  ? t(
                      "本版本任务已完成，可重新练习。",
                      "Completed for this source version. You can repeat it.",
                    )
                  : t(
                      "选择源连杆 → 手动移动独立关节 → 恢复零位。仅根据实际选择和关节状态推进。",
                      "Select a source link → move an independent joint → restore zero. Progress follows actual selection and joint state.",
                    )}
              </p>
              <button type="button" onClick={start}>
                {phase === "complete"
                  ? t("重新练习", "Repeat task")
                  : t("开始动手任务", "Start task")}
              </button>
              {compact && (
                <button type="button" onClick={() => setDismissed(true)}>
                  {t("收起提示", "Dismiss notice")}
                </button>
              )}
            </>
          ) : (
            <>
              <p>
                {phase === "select"
                  ? t(
                      `在结构探索中选择连杆：${task.link}`,
                      `Select source link in Structure: ${task.link}`,
                    )
                  : phase === "move"
                    ? t(
                        `将独立关节 ${task.joint} 移到 ${task.target.toFixed(4)} ${task.unit}（±${task.tolerance.toFixed(4)}）。`,
                        `Move independent joint ${task.joint} to ${task.target.toFixed(4)} ${task.unit} (±${task.tolerance.toFixed(4)}).`,
                      )
                    : t(
                        `将关节 ${task.joint} 恢复到 0 ${task.unit}。`,
                        `Restore joint ${task.joint} to 0 ${task.unit}.`,
                      )}
              </p>
              {phase === "move" &&
                !session.armed &&
                Math.abs(current - task.target) <= task.tolerance && (
                  <small>
                    {t(
                      "当前已在目标附近；请先移开，再主动移回目标。",
                      "Already near the target: move away first, then return to it.",
                    )}
                  </small>
                )}
              {phase !== "select" && (
                <output>
                  {t("当前", "Current")}:{" "}
                  {Number.isFinite(current) ? current.toFixed(4) : "—"}{" "}
                  {task.unit}
                </output>
              )}
              <div>
                <button type="button" onClick={guide}>
                  {phase === "select"
                    ? t("前往结构探索", "Go to Structure")
                    : t("前往关节实验", "Go to Joints")}
                </button>
                <button
                  type="button"
                  onClick={() => setSession(idleExploration(task))}
                >
                  {t("取消本次", "Cancel task")}
                </button>
              </div>
            </>
          )}
          {!compact && (
            <small>
              {t(
                "仅为本模型版本的界面练习，不代表机械原理、接触操作或实物能力认证。切换机型会取消未完成任务。",
                "A UI exercise for this model version, not certification of mechanics, contact operation or hardware capability. Switching models cancels unfinished tasks.",
              )}
            </small>
          )}
          {!storage && (
            <small role="status">
              {t(
                "本地保存不可用；本次任务仍可完成，但刷新后不会保留。",
                "Local storage is unavailable. The task still works, but completion will not survive reload.",
              )}
            </small>
          )}
        </>
      )}
    </section>
  );
}
