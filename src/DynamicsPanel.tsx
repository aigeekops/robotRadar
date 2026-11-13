import { useEffect, useRef, useState } from "react";
import { Activity, Play, Download, RefreshCw, Pause } from "lucide-react";
import type { Lang } from "./types";
import { createBrowserPhysicsClient } from "./browserPhysics";

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

export default function DynamicsPanel({ lang, robotId, onState }: Props) {
  const t = (zh: string, en: string) => (lang === "zh" ? zh : en);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [engineVersion, setEngineVersion] = useState("");
  const client = useRef<ReturnType<typeof createBrowserPhysicsClient> | null>(
    null,
  );
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
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setAvailable(null);
    setError("");
    client.current ??= createBrowserPhysicsClient();
    client.current
      .profile(controller.signal)
      .then((profile) => {
        if (controller.signal.aborted || request.current !== controller) return;
        setEngineVersion(String(profile.engineVersion));
        setAvailable(true);
      })
      .catch((error) => {
        if (controller.signal.aborted || request.current !== controller) return;
        setAvailable(false);
        setError(error instanceof Error ? error.message : String(error));
      });
  };
  useEffect(() => {
    if (robotId === "g1") check();
    return () => {
      request.current?.abort();
      client.current?.dispose();
      client.current = null;
      if (playback.current) clearInterval(playback.current);
    };
  }, [robotId]);
  const simulate = async () => {
    stop();
    setError("");
    setBusy(true);
    setResult(null);
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    try {
      client.current ??= createBrowserPhysicsClient();
      const data = await client.current.simulate(
        { joint, torque, duration },
        controller.signal,
      );
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
        <strong>MuJoCo {engineVersion}</strong>
        <span>{t("浏览器 WASM · 固定基座", "BROWSER WASM · FIXED BASE")}</span>
      </div>
      <p className="panel-intro">
        {t(
          "MuJoCo WebAssembly 在浏览器工作线程中运行，不依赖 Python 服务。使用同配置 Mode10 URDF 的质量、惯性和关节，比较小扭矩与零控制。基座固定，不代表站立控制、行走、SDK 或实体硬件。",
          "MuJoCo WebAssembly runs in a browser worker without a Python service. Matching Mode10 URDF mass, inertia and joints drive the controlled/zero-control comparison. The base is fixed; this is not standing control, locomotion, an SDK or physical hardware.",
        )}
      </p>
      <div className="service-state">
        <i className={available ? "online" : ""} />
        {available
          ? t("浏览器引擎已就绪", "Browser engine ready")
          : available === null
            ? t("正在加载浏览器引擎…", "Loading browser engine…")
            : t("浏览器引擎加载失败", "Browser engine unavailable")}
        <button
          onClick={check}
          disabled={busy}
          aria-label={t("检查引擎", "Check engine")}
        >
          <RefreshCw size={14} />
        </button>
      </div>
      {available === false && (
        <div className="notice">
          {t(
            "请检查网络、浏览器 WebAssembly 支持及静态资源是否完整，然后点检查引擎重试。无需启动 Python 或本地动力学服务。",
            "Check network access, WebAssembly support and the static assets, then retry. No Python or local dynamics service is required.",
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
      {busy && (
        <button
          className="secondary wide"
          onClick={() => {
            request.current?.abort();
            client.current?.dispose();
            setBusy(false);
            setAvailable(false);
            setError(
              t(
                "计算已取消，可重新加载引擎后再运行。",
                "Calculation cancelled. Reload the engine to run again.",
              ),
            );
          }}
        >
          {t("取消计算", "Cancel calculation")}
        </button>
      )}
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
