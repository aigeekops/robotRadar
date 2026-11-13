import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronRight,
  Pause,
  Play,
  RotateCcw,
  Undo2,
} from "lucide-react";
import { availableSteps, completeStep, undoStep } from "./core/assembly";
import { chainExercises } from "./robotLearning";
import type { Lang } from "./types";

type Props = {
  lang: Lang;
  robotId: string;
  revision: string;
  onReveal: (visible: string[], focus: string[]) => void;
};
export default function AssemblyPanel({
  lang,
  robotId,
  revision,
  onReveal,
}: Props) {
  const exercise = chainExercises.find((item) => item.robotId === robotId);
  const storageKey = `robot-radar:chain:v1:${robotId}:${revision}`;
  const t = (zh: string, en: string) => (lang === "zh" ? zh : en);
  const [completed, setCompleted] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
      if (!Array.isArray(saved) || !exercise) return [];
      let done: string[] = [];
      for (const id of saved) done = completeStep(exercise.steps, done, id);
      return done;
    } catch {
      return [];
    }
  });
  const [selectedStep, setSelectedStep] = useState(
    exercise?.steps[0]?.id || "",
  );
  const [feedback, setFeedback] = useState("");
  const [auto, setAuto] = useState(false);
  const reveal = useRef(onReveal);
  reveal.current = onReveal;
  const current =
    exercise?.steps.find((step) => step.id === selectedStep) ||
    exercise?.steps[0];
  useEffect(() => {
    if (!exercise) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(completed));
    } catch {}
    const visible = exercise.steps
      .filter((step) => completed.includes(step.id))
      .flatMap((step) => step.partIds);
    const latest = exercise.steps.find((step) => step.id === completed.at(-1));
    reveal.current(
      visible,
      completed.length === exercise.steps.length
        ? visible
        : latest?.partIds || [],
    );
  }, [completed, exercise, storageKey]);
  useEffect(() => {
    if (!auto || !exercise) return;
    const next = availableSteps(exercise.steps, completed)[0];
    if (!next) {
      setAuto(false);
      return;
    }
    const timeout = setTimeout(() => {
      setCompleted((done) => completeStep(exercise.steps, done, next.id));
      setSelectedStep(next.id);
    }, 1500);
    return () => clearTimeout(timeout);
  }, [auto, completed, exercise]);
  if (!exercise || !current)
    return (
      <p className="notice">
        {t(
          "此机型的运动链课程尚未建立。",
          "No source-backed chain exercise exists for this model yet.",
        )}
      </p>
    );
  const next = availableSteps(exercise.steps, completed)[0];
  const choose = (id: string) => {
    setAuto(false);
    setSelectedStep(id);
    setFeedback("");
  };
  const add = () => {
    try {
      setCompleted(completeStep(exercise.steps, completed, current.id));
      setFeedback(
        t(
          "连接正确，观察模型中新增的运动链。",
          "Correct connection. Observe the newly revealed chain.",
        ),
      );
    } catch {
      setFeedback(
        t(
          "请先完成这个连杆的上游依赖，再连接它。",
          "Connect the upstream dependencies before adding this link.",
        ),
      );
    }
  };
  return (
    <section className="chain-panel">
      <div className="panel-title">
        <div>
          <span className="eyebrow">REBUILD THE KINEMATIC CHAIN</span>
          <h3>{exercise.title[lang]}</h3>
        </div>
      </div>
      <div className="notice chain-disclaimer">{exercise.disclaimer[lang]}</div>
      <div className="progress-label">
        <span>{t("运动链重建进度", "Chain reconstruction")}</span>
        <b>
          {completed.length} / {exercise.steps.length}
        </b>
      </div>
      <div className="progress-track">
        <i
          style={{
            width: `${(completed.length / exercise.steps.length) * 100}%`,
          }}
        />
      </div>
      <ol className="chain-steps">
        {exercise.steps.map((step, index) => (
          <li key={step.id}>
            <button
              className={`${step.id === current.id ? "active" : ""} ${completed.includes(step.id) ? "done" : ""}`}
              onClick={() => choose(step.id)}
            >
              <span>
                {completed.includes(step.id) ? <Check size={13} /> : index + 1}
              </span>
              <strong>{step.title[lang]}</strong>
              <ChevronRight size={14} />
            </button>
          </li>
        ))}
      </ol>
      <article className="chain-current">
        <span className="eyebrow">{t("当前连接", "CURRENT CONNECTION")}</span>
        <h4>{current.title[lang]}</h4>
        <p>{current.body[lang]}</p>
        <div className="part-tags">
          {current.partIds.map((id) => (
            <code key={id}>{id}</code>
          ))}
        </div>
        <a href={current.sourceUrl} target="_blank" rel="noreferrer">
          {t("核对官方关节拓扑", "Inspect official joint topology")} ↗
        </a>
        <button
          className="primary wide"
          disabled={completed.includes(current.id)}
          onClick={add}
        >
          {completed.includes(current.id)
            ? t("已连接", "Connected")
            : t("连接这一步", "Connect this step")}
        </button>
        {feedback && (
          <p className="chain-feedback" role="status">
            {feedback}
          </p>
        )}
      </article>
      <div className="chain-toolbar">
        <button
          className="secondary"
          onClick={() => {
            setFeedback("");
            setAuto(!auto);
          }}
          disabled={completed.length === exercise.steps.length}
        >
          {auto ? <Pause size={14} /> : <Play size={14} />}{" "}
          {auto ? t("暂停演示", "Pause demo") : t("自动演示", "Auto demo")}
        </button>
        <button
          className="icon-button"
          title={t("撤销上一步", "Undo last step")}
          disabled={!completed.length}
          onClick={() => {
            setAuto(false);
            setCompleted((done) =>
              undoStep(exercise.steps, done, done.at(-1)!),
            );
          }}
        >
          <Undo2 size={15} />
        </button>
        <button
          className="icon-button"
          title={t("重新开始", "Start over")}
          onClick={() => {
            setAuto(false);
            setCompleted([]);
            setSelectedStep(exercise.steps[0].id);
            setFeedback("");
          }}
        >
          <RotateCcw size={15} />
        </button>
      </div>
      {next && (
        <button className="text-button" onClick={() => choose(next.id)}>
          {t(
            "提示：定位下一个可连接步骤",
            "Hint: show the next available step",
          )}{" "}
          →
        </button>
      )}
      {completed.length === exercise.steps.length && (
        <div className="chain-success">
          <Check size={18} />
          <span>
            {t(
              "运动链重建完成。它说明运动学关系，不证明维修拆装顺序。",
              "Chain complete. This verifies the kinematic relationship, not a service disassembly sequence.",
            )}
          </span>
        </div>
      )}
    </section>
  );
}
