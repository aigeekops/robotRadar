import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, RotateCcw, Move3D } from "lucide-react";
import type { JointInfo, Lang } from "./types";
import {
  boundedPose,
  directPresets,
  sampleDirectMotion,
} from "./core/directMotion";
export default function DirectMotionPanel({
  robotId,
  lang,
  joints,
  onPose,
  onStop,
}: {
  robotId: string;
  lang: Lang;
  joints: JointInfo[];
  onPose: (values: Record<string, number>) => void;
  onStop?: () => void;
}) {
  const t = (zh: string, en: string) => (lang === "zh" ? zh : en);
  const signature = joints
    .map((j) => `${j.name}:${j.lower}:${j.upper}`)
    .join("|");
  const presets = useMemo(
    () => directPresets(robotId, joints),
    [robotId, signature],
  );
  const [choice, setChoice] = useState("");
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(1);
  const progressRef = useRef(0);
  const poseRef = useRef(onPose);
  const stopRef = useRef(onStop);
  poseRef.current = onPose;
  stopRef.current = onStop;
  const preset = presets.find((p) => p.id === choice) || presets[0];
  useEffect(() => {
    setPlaying(false);
    setChoice("");
    setProgress(0);
    progressRef.current = 0;
  }, [robotId, signature]);
  useEffect(() => {
    if (!playing || !preset) return;
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const next = Math.min(
        1,
        progressRef.current +
          (Math.min(0.1, (now - previous) / 1000) * speed) / preset.duration,
      );
      previous = now;
      progressRef.current = next;
      setProgress(next);
      poseRef.current(sampleDirectMotion(preset, next));
      if (next < 1) frame = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, preset, speed]);
  const seek = (next: number) => {
    if (!preset) return;
    stopRef.current?.();
    setPlaying(false);
    progressRef.current = next;
    setProgress(next);
    poseRef.current(sampleDirectMotion(preset, next));
  };
  return (
    <section className="direct-motion-panel" data-testid="direct-motion-panel">
      <div className="dynamics-badge">
        <Move3D size={17} />
        <strong>{t("直接动作控制", "DIRECT MOTION")}</strong>
      </div>
      <p className="panel-intro">
        {t(
          "点击动作即可播放，也可拖动时间轴检查每个姿态。",
          "Play a motion or scrub its timeline to inspect each pose.",
        )}
      </p>
      <div className="lesson-picker">
        {presets.map((p) => (
          <button
            key={p.id}
            className={preset?.id === p.id ? "active" : ""}
            onClick={() => {
              stopRef.current?.();
              setChoice(p.id);
              progressRef.current = 0;
              setProgress(0);
              poseRef.current(sampleDirectMotion(p, 0));
              setPlaying(true);
            }}
            data-testid={`direct-preset-${p.id}`}
          >
            <Play size={13} />
            {p.name[lang]}
          </button>
        ))}
      </div>
      {preset ? (
        <>
          <p className="panel-intro">{preset.description[lang]}</p>
          <div className="program-toolbar">
            <button
              className="primary"
              data-testid="direct-toggle"
              onClick={() => {
                stopRef.current?.();
                if (progressRef.current >= 1) {
                  progressRef.current = 0;
                  setProgress(0);
                }
                setPlaying((p) => !p);
              }}
            >
              {playing ? <Pause size={14} /> : <Play size={14} />}{" "}
              {playing
                ? t("暂停动作", "Pause motion")
                : t("播放动作", "Play motion")}
            </button>
            <button
              className="secondary"
              data-testid="direct-reset"
              onClick={() => {
                stopRef.current?.();
                setPlaying(false);
                setProgress(0);
                progressRef.current = 0;
                poseRef.current(boundedPose(joints));
              }}
            >
              <RotateCcw size={13} />
              {t("动作复位", "Reset motion")}
            </button>
          </div>
          <label className="control-label">
            {t("动作进度", "Motion progress")} · {Math.round(progress * 100)}%
            <input
              type="range"
              aria-label={t("动作进度", "Motion progress")}
              min="0"
              max="1"
              step="0.01"
              value={progress}
              onChange={(e) => seek(Number(e.target.value))}
            />
          </label>
          <label className="control-label">
            {t("播放速度", "Playback speed")} · {speed}×
            <input
              type="range"
              aria-label={t("播放速度", "Playback speed")}
              min="0.25"
              max="2"
              step="0.25"
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
            />
          </label>
        </>
      ) : (
        <p className="notice">
          {t(
            "等待匹配的模型关节；不向未知关节发送动作。",
            "Waiting for matching model joints. No commands are sent to unknown joints.",
          )}
        </p>
      )}
      <p className="notice" data-testid="direct-motion-boundary">
        {t(
          "运动学姿态预览：遵守 URDF 位置限位，不计算平衡、地面接触、自碰撞或动力学，不代表真实行走、抓取或硬件控制。",
          "Kinematic pose preview within URDF position limits. No balance, ground contact, self-collision or dynamics. This is not real locomotion, grasping or hardware control.",
        )}
      </p>
    </section>
  );
}
