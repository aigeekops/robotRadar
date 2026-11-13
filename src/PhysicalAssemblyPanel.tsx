import { useEffect, useRef, useState } from "react";
import { BookOpen, Check, Focus, RotateCcw } from "lucide-react";
import type { Lang } from "./types";
import {
  answerPhysicalQuestion,
  emptyPhysicalProgress,
  markPhysicalRead,
  PHYSICAL_READING_KEY,
  physicalAssemblyDisclaimer,
  physicalReadingModules,
  restorePhysicalProgress,
  understoodPhysicalModules,
} from "./physicalAssembly";
import "./styles/physicalAssembly.css";

type Props = { lang: Lang; onObserve: (parts: string[]) => void };
export default function PhysicalAssemblyPanel({ lang, onObserve }: Props) {
  const t = (zh: string, en: string) => (lang === "zh" ? zh : en);
  const [progress, setProgress] = useState(() => {
    try {
      return restorePhysicalProgress(
        localStorage.getItem(PHYSICAL_READING_KEY),
      );
    } catch {
      return emptyPhysicalProgress();
    }
  });
  const [active, setActive] = useState(physicalReadingModules[0].id);
  const [storageError, setStorageError] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const observe = useRef(onObserve);
  observe.current = onObserve;
  const current = physicalReadingModules.find((entry) => entry.id === active)!;
  const understood = understoodPhysicalModules(progress);
  const ready = current.prerequisites.every((id) => understood.includes(id));
  const read = progress.read.includes(current.id);
  const answer = progress.answers[current.id];
  useEffect(() => {
    observe.current(current.partIds);
  }, [current]);
  useEffect(() => {
    try {
      localStorage.setItem(PHYSICAL_READING_KEY, JSON.stringify(progress));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [progress]);
  return (
    <section
      className="physical-assembly-panel"
      data-testid="physical-assembly-panel"
    >
      <div className="panel-title">
        <div>
          <span className="eyebrow">
            {t("开放硬件 · 文档学习", "OPEN HARDWARE · DOCUMENT STUDY")}
          </span>
          <h3>
            {t("SO-101 官方装配阅读", "SO-101 official assembly reading")}
          </h3>
        </div>
      </div>
      <div className="notice" data-testid="physical-learning-disclaimer">
        {physicalAssemblyDisclaimer[lang]}
      </div>
      <div className="progress-label">
        <span>{t("阅读 / 理解", "Read / understood")}</span>
        <b data-testid="physical-progress">
          {progress.read.length} / {understood.length} ·{" "}
          {physicalReadingModules.length}
        </b>
      </div>
      <div className="progress-track">
        <i
          style={{
            width: `${(understood.length / physicalReadingModules.length) * 100}%`,
          }}
        />
      </div>
      <p className="physical-status">
        {t(
          "实体装配：未验证 · 电气与校准：未执行",
          "Physical assembly: unverified · Electrical work and calibration: not executed",
        )}
      </p>
      {storageError && (
        <p role="alert" className="notice">
          {t(
            "当前浏览器无法保存进度，本页学习仍可继续。",
            "This browser cannot save progress; learning can continue in this session.",
          )}
        </p>
      )}
      <div
        className="lesson-picker"
        aria-label={t("装配阅读模块", "Assembly reading modules")}
      >
        {physicalReadingModules.map((entry, index) => (
          <button
            key={entry.id}
            className={entry.id === active ? "active" : ""}
            onClick={() => {
              setActive(entry.id);
              setConfirmReset(false);
            }}
            data-testid={`physical-module-${index}`}
          >
            <span>
              {understood.includes(entry.id) ? <Check size={12} /> : index + 1}
            </span>
            {entry.title[lang]}
          </button>
        ))}
      </div>
      <article className="lesson-article">
        <h3>{current.title[lang]}</h3>
        <div className="lesson-body">{current.body[lang]}</div>
        {current.fasteners.length > 0 && (
          <div className="physical-fasteners">
            <h4>{t("官方文字中的紧固件", "Fasteners in the official text")}</h4>
            <ul>
              {current.fasteners.map((item, index) => (
                <li key={index}>{item[lang]}</li>
              ))}
            </ul>
          </div>
        )}
        {current.ambiguity && (
          <div className="notice" data-testid="physical-ambiguity">
            {current.ambiguity[lang]}
          </div>
        )}
        <div className="mechanism-tools">
          <button
            className="secondary"
            onClick={() => onObserve(current.partIds)}
          >
            <Focus size={14} />
            {t("观察相关装配体", "Observe related assemblies")}
          </button>
        </div>
        <p className="physical-status">
          {t(
            "高亮只定位模型装配体，未逐孔核验；外链视频未逐帧检查。",
            "Highlighting identifies model assemblies, not verified screw holes; external videos were not reviewed frame by frame.",
          )}
        </p>
        <a href={current.sourceUrl} target="_blank" rel="noreferrer">
          {t("查看固定版本官方原文", "Read the pinned official text")} · L
          {current.sourceLines[0]}–{current.sourceLines[1]} ↗
        </a>
        {current.additionalSourceUrls?.map((url, index) => (
          <a
            className="physical-extra-source"
            key={url}
            href={url}
            target="_blank"
            rel="noreferrer"
          >
            {t("补充来源", "Additional source")} {index + 1} ↗
          </a>
        ))}
        {!ready && (
          <p className="notice" data-testid="physical-prerequisite">
            {t(
              "可以预览文字。请先完成前一模块的阅读与理解检查，再记录本模块进度。",
              "You may preview this text. Complete the previous module's reading and comprehension check before recording progress here.",
            )}
          </p>
        )}
        <button
          className="primary wide physical-read-button"
          disabled={!ready || read}
          data-testid="physical-mark-read"
          onClick={() =>
            setProgress((value) => markPhysicalRead(value, current.id))
          }
        >
          <BookOpen size={14} />
          {read
            ? t("已阅读（仅学习记录）", "Read (learning record only)")
            : t("标记已阅读", "Mark as read")}
        </button>
        <div className="question" data-testid="physical-question">
          <h4>{current.question.prompt[lang]}</h4>
          {current.question.options.map((option, index) => (
            <button
              key={index}
              disabled={!read || !ready}
              aria-pressed={answer === index}
              data-testid={`physical-answer-${index}`}
              className={
                answer === index
                  ? index === current.question.answer
                    ? "correct"
                    : "incorrect"
                  : ""
              }
              onClick={() =>
                setProgress((value) =>
                  answerPhysicalQuestion(value, current.id, index),
                )
              }
            >
              <span>{String.fromCharCode(65 + index)}</span>
              {option[lang]}
            </button>
          ))}
          {answer !== undefined && (
            <p className="answer-explanation" role="status">
              {answer === current.question.answer
                ? t("理解正确。", "Correct understanding. ")
                : t("再核对一次原文。", "Review the source and try again. ")}
              {current.question.explanation[lang]}
            </p>
          )}
        </div>
      </article>
      {understood.includes(current.id) &&
        physicalReadingModules.findIndex((entry) => entry.id === current.id) <
          physicalReadingModules.length - 1 && (
          <button
            className="secondary wide"
            data-testid="physical-next"
            onClick={() =>
              setActive(
                physicalReadingModules[
                  physicalReadingModules.findIndex(
                    (entry) => entry.id === current.id,
                  ) + 1
                ].id,
              )
            }
          >
            {t("下一模块", "Next module")} →
          </button>
        )}
      {understood.length === physicalReadingModules.length && (
        <div className="chain-success" data-testid="physical-all-understood">
          <Check size={18} />
          <span>
            {t(
              "阅读与理解练习完成。实体装配、校准与安全状态仍未验证。",
              "Reading and comprehension complete. Physical assembly, calibration, and safety remain unverified.",
            )}
          </span>
        </div>
      )}
      <div className="chain-toolbar">
        <button
          className="secondary"
          onClick={() => setConfirmReset(!confirmReset)}
        >
          <RotateCcw size={14} />
          {t("重置阅读进度", "Reset reading progress")}
        </button>
      </div>
      {confirmReset && (
        <div className="notice">
          <p>
            {t(
              "只清除此课程的阅读与答题记录，不影响运动链或其他课程。",
              "Only this lesson's reading and answers will be cleared, not chain exercises or other courses.",
            )}
          </p>
          <button
            className="secondary"
            data-testid="physical-confirm-reset"
            onClick={() => {
              setProgress(emptyPhysicalProgress());
              setActive(physicalReadingModules[0].id);
              setConfirmReset(false);
            }}
          >
            {t("确认重置学习记录", "Confirm learning reset")}
          </button>
          <button
            className="text-button"
            onClick={() => setConfirmReset(false)}
          >
            {t("取消", "Cancel")}
          </button>
        </div>
      )}
    </section>
  );
}
