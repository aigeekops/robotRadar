import type { Lang, RobotEntry } from "./types";
import "./styles/challengeLoading.css";

/** Keep the target identity visible while its own challenge scene is loading.
 * Progress counts completed mesh instances, never claims a network byte %. */
export default function ChallengeLoading({
  robot,
  lang,
  failed,
  completed,
  total,
  retryLabel,
  onRetry,
  onBack,
}: {
  robot: RobotEntry;
  lang: Lang;
  failed: boolean;
  completed: number;
  total: number;
  retryLabel: string;
  onRetry: () => void;
  onBack: () => void;
}) {
  const zh = lang === "zh";
  return (
    <div
      className="challenge-loading"
      data-testid="challenge-loading"
      data-robot-id={robot.id}
      data-load-state={failed ? "error" : "loading"}
      role={failed ? "alert" : "status"}
      aria-live="polite"
    >
      <div className="challenge-loading-card">
        <span className="eyebrow">{robot.name[lang]}</span>
        <h3>
          {failed
            ? zh
              ? "模型未能加载完成"
              : "Model could not finish loading"
            : zh
              ? "正在准备挑战模型"
              : "Preparing challenge model"}
        </h3>
        {!failed && (
          <progress
            aria-label={zh ? "模型部件加载进度" : "Model part loading progress"}
            max={total || 1}
            value={total ? completed : undefined}
          />
        )}
        <p>
          {failed
            ? zh
              ? "未开始计分，已加载的旧机型不会用于本次挑战。请重试或返回选择机型。"
              : "Scoring has not started. A previously loaded robot will not be used. Retry or return to the model selector."
            : total
              ? zh
                ? `已准备 ${completed} / ${total} 个模型部件；完成后自动进入。`
                : `Prepared ${completed} / ${total} model parts. The challenge starts when all are ready.`
              : zh
                ? "正在读取模型描述和部件清单，暂不开始计分。"
                : "Reading the model description and part list. Scoring has not started."}
        </p>
        {failed && <button onClick={onRetry}>{retryLabel}</button>}
        <button onClick={onBack}>
          {zh ? "返回机型选择" : "Back to models"}
        </button>
      </div>
    </div>
  );
}
