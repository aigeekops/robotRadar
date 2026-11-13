import { useEffect, useRef, useState } from "react";
import { Activity, Play, Download, RefreshCw, Pause } from "lucide-react";
import type { Lang } from "./types";

type Sample = { time: number; joints: Record<string, number> };
type Result = {
  trajectory: Sample[];
  request: unknown;
  comparison: unknown;
  controlled: {
    maxJointLimitExcessRad: number;
    finite: boolean;
    steps: number;
    samples: { time: number; positions: Record<string, number> }[];
  };
  [key: string]: unknown;
};
type Props = {
  lang: Lang;
  robotId: string;
  onState: (joints: Record<string, number>) => void;
};
const endpoint = "http://127.0.0.1:8765";
export default function LegacyDynamicsPanel({ lang, robotId, onState }: Props) {
  const t = (zh: string, en: string) => (lang === "zh" ? zh : en);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [torque, setTorque] = useState(0.2);
  const [duration, setDuration] = useState(0.2);
  const [joint, setJoint] = useState("left_elbow_joint");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const playback = useRef<ReturnType<typeof setInterval> | null>(null);
  const request = useRef<AbortController | null>(null);
  const stateCallback = useRef(onState);
  stateCallback.current = onState;
  const stop = () => {
    if (playback.current) clearInterval(playback.current);
    playback.current = null;
    setPlaying(false);
  };
  const check = () => {
    fetch(endpoint + "/health", { signal: AbortSignal.timeout(3000) })
      .then((r) => setAvailable(r.ok))
      .catch(() => setAvailable(false));
  };
  useEffect(() => {
    check();
    return () => {
      request.current?.abort();
      if (playback.current) clearInterval(playback.current);
    };
  }, []);
  const simulate = async () => {
    stop();
    setError("");
    setBusy(true);
    setResult(null);
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    try {
      const response = await fetch(endpoint + "/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ joint, torque, duration }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || `HTTP ${response.status}`);
      if (
        !Array.isArray(data.controlled?.samples) ||
        !data.controlled.samples.length
      )
        throw Error(t("服务未返回有效轨迹", "Service returned no trajectory"));
      const trajectory = data.controlled.samples.map(
        (sample: { time: number; positions: Record<string, number> }) => ({
          time: sample.time,
          joints: sample.positions,
        }),
      );
      setResult({ ...data, trajectory });
      setAvailable(true);
      setTime(0);
      stateCallback.current(trajectory[0].joints);
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  const play = () => {
    if (!result) return;
    stop();
    setPlaying(true);
    const start = performance.now();
    playback.current = setInterval(() => {
      const elapsed = (performance.now() - start) / 1000;
      const sample =
        result.trajectory.find((p) => p.time >= elapsed) ||
        result.trajectory.at(-1)!;
      setTime(sample.time);
      stateCallback.current(sample.joints);
      if (elapsed >= result.trajectory.at(-1)!.time) stop();
    }, 20);
  };
  const exportResult = () => {
    if (!result) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "g1-mode10-mujoco-result.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  if (robotId !== "g1")
    return (
      <div className="notice">
        {t(
          "当前动力学技术验证仅支持 G1 Mode10。其他模型没有冒用该配置。",
          "The dynamics verification currently supports G1 Mode10 only. Other robots do not reuse this configuration.",
        )}
      </div>
    );
  return (
    <div className="dynamics-panel">
      <div className="dynamics-badge">
        <Activity size={16} />
        <strong>MuJoCo</strong>
        <span>{t("真实引擎 · 固定基座", "REAL ENGINE · FIXED BASE")}</span>
      </div>
      <p className="panel-intro">
        {t(
          "以同配置 Mode10 URDF 的质量、惯性和关节构建真实动力学。施加小扭矩，比较有/无控制的运行结果。基座固定，不代表站立控制、行走、SDK 或实体硬件。",
          "Real dynamics from the matching Mode10 URDF mass, inertia and joints. Apply a small torque and compare controlled versus zero-control outcomes. The base is fixed; this is not standing control, locomotion, an SDK or physical hardware.",
        )}
      </p>
      <div className="service-state">
        <i className={available ? "online" : ""} />
        {available
          ? t("本地引擎已连接", "Local engine connected")
          : t("本地引擎未连接", "Local engine disconnected")}
        <button onClick={check} aria-label={t("检查引擎", "Check engine")}>
          <RefreshCw size={14} />
        </button>
      </div>
      {available === false && (
        <div className="notice">
          {t(
            "双击项目中的「启动机器人实验室.command」会同时启动本地引擎。也可按照 README 单独启动动力学服务。",
            "Double-click the project launcher to start the local engine, or follow the README to launch the dynamics service separately.",
          )}
        </div>
      )}
      <label className="control-label">
        {t("施加扭矩的关节", "Torque joint")}
        <select value={joint} onChange={(e) => setJoint(e.target.value)}>
          <option value="left_elbow_joint">left_elbow_joint</option>
          <option value="right_elbow_joint">right_elbow_joint</option>
          <option value="left_knee_joint">left_knee_joint</option>
          <option value="right_knee_joint">right_knee_joint</option>
        </select>
      </label>
      <div className="joint-control">
        <div>
          <label htmlFor="torque">{t("外加扭矩", "Applied torque")}</label>
          <b>{torque.toFixed(2)} N·m</b>
        </div>
        <input
          id="torque"
          type="range"
          min="-0.5"
          max="0.5"
          step=".05"
          value={torque}
          onChange={(e) => setTorque(Number(e.target.value))}
        />
      </div>
      <div className="joint-control">
        <div>
          <label htmlFor="duration">
            {t("模拟时长", "Simulation duration")}
          </label>
          <b>{duration.toFixed(2)} s</b>
        </div>
        <input
          id="duration"
          type="range"
          min=".05"
          max=".5"
          step=".05"
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
        />
      </div>
      <button
        className="primary wide"
        disabled={busy || available !== true}
        onClick={() => void simulate()}
      >
        <Activity size={15} />
        {busy
          ? t("引擎计算中…", "Simulating…")
          : t("执行真实动力学", "Run real dynamics")}
      </button>
      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}
      {result && (
        <>
          <div className="program-toolbar">
            <button className="secondary" onClick={playing ? stop : play}>
              {playing ? <Pause size={14} /> : <Play size={14} />}{" "}
              {playing
                ? t("停止回放", "Stop playback")
                : t("回放计算轨迹", "Replay computed trajectory")}
            </button>
            <span>{time.toFixed(3)} s</span>
            <button
              className="icon-button"
              title={t("导出引擎结果", "Export engine result")}
              onClick={exportResult}
            >
              <Download size={16} />
            </button>
          </div>
          <div className="dynamics-readout">
            <span>{joint}</span>
            <strong>
              {(
                result.trajectory.find((sample) => sample.time >= time)?.joints[
                  joint
                ] ?? result.trajectory.at(-1)!.joints[joint]
              ).toFixed(6)}{" "}
              <small>rad</small>
            </strong>
            <p>
              {t(
                "当前回放采样原值；不经过显示限位裁剪。",
                "Raw playback sample, without display-limit clamping.",
              )}
            </p>
          </div>
          <div className="trace-panel">
            <span className="eyebrow">
              {t("真实引擎返回值", "ACTUAL ENGINE OUTPUT")}
            </span>
            <pre>
              {JSON.stringify(
                {
                  request: result.request,
                  comparison: result.comparison,
                  finite: result.controlled.finite,
                  steps: result.controlled.steps,
                  maxJointLimitExcessRad:
                    result.controlled.maxJointLimitExcessRad,
                },
                null,
                2,
              )}
            </pre>
            <p>
              {result.trajectory.length}{" "}
              {t(
                "轨迹采样。引擎使用软限位，可能有小幅越限；回放保留原值、不裁剪。可导出原始结果核查。",
                "trajectory samples. Soft joint limits may be exceeded slightly; raw values are replayed without display clamping. Export the result for inspection.",
              )}
            </p>
          </div>
        </>
      )}
      <div className="notice">
        {t(
          "能力边界：URDF 中的惯性和碰撞模型不是经过实机标定的完整数字孪生；当前仅用于有证据的技术验证。",
          "Scope: URDF inertia and collision geometry are not a fully calibrated digital twin. This is a source-backed technical verification only.",
        )}
      </div>
    </div>
  );
}
