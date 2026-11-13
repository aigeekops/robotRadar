import { useEffect, useRef, useState } from "react";
import { Check, Focus, Layers3, RotateCcw } from "lucide-react";
import { robotLessons } from "./robotLearning";
import type { Lang } from "./types";
type Props = {
  lang: Lang;
  robotId: string;
  revision: string;
  onInspect: (ids: string[], isolate: boolean) => void;
  onRestore: () => void;
  lessonId: string;
  onLessonChange: (id: string) => void;
};
export default function StructureLessonsPanel({
  lang,
  robotId,
  revision,
  onInspect,
  onRestore,
  lessonId,
  onLessonChange,
}: Props) {
  const t = (zh: string, en: string) => (lang === "zh" ? zh : en);
  const entries = robotLessons.filter((lesson) => lesson.robotId === robotId);
  const active = entries.some((entry) => entry.id === lessonId)
    ? lessonId
    : entries[0]?.id || "";
  const [isolate, setIsolate] = useState(false);
  const storageKey = `robot-radar:mechanisms:v1:${robotId}:${revision}`;
  const [done, setDone] = useState<string[]>(() => {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey) || "[]");
      return Array.isArray(value)
        ? value.filter((id) => entries.some((l) => l.id === id))
        : [];
    } catch {
      return [];
    }
  });
  const lesson = entries.find((item) => item.id === active) || entries[0];
  const inspect = useRef(onInspect);
  inspect.current = onInspect;
  useEffect(() => {
    if (lesson) inspect.current(lesson.partIds, isolate);
  }, [lesson?.id, isolate]);
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(done));
    } catch {}
  }, [storageKey, done]);
  if (!lesson)
    return (
      <div className="notice">
        {t(
          "该机型暂没有已核验机构课程。",
          "No verified mechanism lessons for this robot yet.",
        )}
      </div>
    );
  return (
    <section className="mechanism-panel">
      <div className="panel-title">
        <div>
          <span className="eyebrow">FOLLOW THE MECHANISM</span>
          <h3>
            {t("课程与真实运动链联动。", "Learn with the actual mechanism.")}
          </h3>
        </div>
      </div>
      <p className="panel-intro">
        {t(
          "每节课只关联官方 URDF 中确实存在的连杆和关节；不猜测内部电气系统。",
          "Each lesson references links and joints that exist in the official URDF. Internal electronics are not inferred.",
        )}
      </p>
      <div className="lesson-picker">
        {entries.map((entry, index) => (
          <button
            key={entry.id}
            className={active === entry.id ? "active" : ""}
            onClick={() => onLessonChange(entry.id)}
          >
            <span>
              {done.includes(entry.id) ? (
                <Check size={12} />
              ) : (
                String(index + 1).padStart(2, "0")
              )}
            </span>
            {entry.title[lang]}
          </button>
        ))}
      </div>
      <article className="lesson-article">
        <h3>{lesson.title[lang]}</h3>
        <p>{lesson.summary[lang]}</p>
        <div className="lesson-body">{lesson.body[lang]}</div>
        <div className="mechanism-tools">
          <button
            className="secondary"
            onClick={() => onInspect(lesson.partIds, isolate)}
          >
            <Focus size={14} />
            {t("聚焦运动链", "Focus chain")}
          </button>
          <button
            className={`secondary ${isolate ? "selected" : ""}`}
            onClick={() => setIsolate(!isolate)}
          >
            <Layers3 size={14} />
            {isolate
              ? t("恢复整机背景", "Show whole robot")
              : t("仅看本课部件", "Isolate lesson parts")}
          </button>
        </div>
        <div className="try-card">
          <div>
            <strong>{t("动手观察", "Observe actively")}</strong>
            <p>{lesson.task[lang]}</p>
          </div>
        </div>
        <div className="part-tags">
          {lesson.jointIds.map((id) => (
            <code key={id}>{id}</code>
          ))}
        </div>
        <a href={lesson.sourceUrl} target="_blank" rel="noreferrer">
          {t("本课原始证据", "Primary evidence")} ↗
        </a>
        <button
          className="primary wide"
          onClick={() =>
            setDone((current) =>
              current.includes(lesson.id) ? current : [...current, lesson.id],
            )
          }
        >
          <Check size={14} />
          {done.includes(lesson.id)
            ? t("本课已完成", "Lesson complete")
            : t("完成本课", "Complete lesson")}
        </button>
        <button className="text-button" onClick={onRestore}>
          <RotateCcw size={12} />
          {t("退出聚焦，恢复观察状态", "Restore observation state")}
        </button>
      </article>
    </section>
  );
}
