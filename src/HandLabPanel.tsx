import { useEffect, useRef, useState } from "react";
import type { Lang, ModelInfo, RobotEntry } from "./types";
import { siteAsset } from "./siteAssets";
import {
  boundedHandPose,
  setHandFingerCurl,
  handFingerCurlLevel,
  handDriveLimits,
  handFollowerPose,
  sampleHandSequence,
  type HandSequence,
  handPreset,
  sampleHandPose,
  validateHandModel,
  type HandDefinition,
  type HandPreset,
} from "./core/handLab";
import "./styles/handLab.css";

type Props = {
  robot: RobotEntry;
  lang: Lang;
  info: ModelInfo;
  definition: HandDefinition;
  values: Record<string, number>;
  onPose: (values: Record<string, number>) => void;
  onHighlight: (links: string[], focus: boolean) => void;
  onStop?: () => void;
};
export default function HandLabPanel({
  robot,
  lang,
  info,
  definition,
  values,
  onPose,
  onHighlight,
  onStop,
}: Props) {
  const t = (zh: string, en: string) => (lang === "zh" ? zh : en);
  const [finger, setFinger] = useState("all");
  const [preset, setPreset] = useState<HandPreset>("open");
  const [playing, setPlaying] = useState(false);
  const [sequence, setSequence] = useState<HandSequence | null>(null);
  const [speed, setSpeed] = useState(1);
  const [motionReady, setMotionReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);
  const from = useRef<Record<string, number>>({});
  const to = useRef<Record<string, number>>({});
  const callbacks = useRef({ onPose, onStop });
  callbacks.current = { onPose, onStop };
  const errors = validateHandModel(definition, info);
  const coupledReady = definition.joints
    .filter((j) => !j.mimic)
    .every((j) => {
      const l = handDriveLimits(definition, j.name);
      return (
        Number.isFinite(l.lower) &&
        Number.isFinite(l.upper) &&
        l.lower <= l.upper
      );
    });
  const ready =
    robot.id === definition.robotId && errors.length === 0 && coupledReady;
  const followers = definition.joints.filter((j) => j.mimic);
  const followerPose = handFollowerPose(
    definition,
    boundedHandPose(definition, values),
  );
  const isLeap = definition.robotId === "leap_hand";
  const group = definition.fingers.find((f) => f.id === finger);
  const displayed = definition.joints.filter(
    (j) => !j.mimic && (finger === "all" || group?.joints.includes(j.name)),
  );
  const pose = boundedHandPose(definition, values);
  const sample = (p: number) =>
    sequence
      ? sampleHandSequence(definition, sequence, p, from.current)
      : sampleHandPose(definition, from.current, to.current, p);
  useEffect(() => {
    setFinger("all");
    setSequence(null);
    setMotionReady(false);
    setPlaying(false);
    setProgress(0);
    progressRef.current = 0;
  }, [robot.id, definition.revision]);
  useEffect(() => {
    if (!ready) setPlaying(false);
  }, [ready]);
  useEffect(() => {
    if (!playing || !ready) return;
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const p = Math.min(
        1,
        progressRef.current +
          (Math.min(0.08, (now - previous) / 1000) * speed) /
            (sequence === "wave" ? 6.5 : sequence === "opposition" ? 7.2 : 1.4),
      );
      previous = now;
      progressRef.current = p;
      setProgress(p);
      callbacks.current.onPose(sample(p));
      if (p < 1) frame = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, ready, definition, sequence, speed]);
  useEffect(() => {
    const stop = () => setPlaying(false);
    const visibility = () => {
      if (document.hidden) stop();
    };
    const reduce = () => {
      if (
        document.documentElement.dataset.reducedMotion === "true" &&
        playing &&
        ready
      ) {
        setPlaying(false);
        if (sequence) return;
        setProgress(1);
        progressRef.current = 1;
        callbacks.current.onPose(boundedHandPose(definition, to.current));
      }
    };
    window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("robot-radar-motion-preference", reduce);
    return () => {
      window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("robot-radar-motion-preference", reduce);
    };
  }, [playing, ready, definition, sequence]);
  const choose = (id: string) => {
    setFinger(id);
    onHighlight(
      id === "all"
        ? [
            ...definition.palmLinks,
            ...definition.fingers.flatMap((f) => f.links),
          ]
        : id === "palm"
          ? definition.palmLinks
          : definition.fingers.find((f) => f.id === id)?.links || [],
      true,
    );
  };
  const start = (id: HandPreset) => {
    if (!ready) return;
    choose("all");
    onStop?.();
    setPlaying(false);
    setPreset(id);
    setSequence(null);
    setMotionReady(true);
    from.current = boundedHandPose(definition, values);
    to.current = handPreset(definition, id);
    if (document.documentElement.dataset.reducedMotion === "true") {
      progressRef.current = 1;
      setProgress(1);
      onPose(to.current);
    } else {
      progressRef.current = 0;
      setProgress(0);
      setPlaying(true);
    }
  };
  const startSequence = (id: HandSequence) => {
    if (!ready) return;
    choose("all");
    onStop?.();
    setPlaying(false);
    setSequence(id);
    setMotionReady(true);
    from.current = boundedHandPose(definition, values);
    const reduced = document.documentElement.dataset.reducedMotion === "true";
    const p = reduced ? 0.5 : 0;
    progressRef.current = p;
    setProgress(p);
    onPose(sampleHandSequence(definition, id, p, from.current));
    if (!reduced) setPlaying(true);
  };
  const seek = (p: number) => {
    if (!ready) return;
    onStop?.();
    setPlaying(false);
    progressRef.current = p;
    setProgress(p);
    onPose(sample(p));
  };
  const reset = () => {
    choose("all");
    onStop?.();
    setPlaying(false);
    setProgress(0);
    progressRef.current = 0;
    setPreset("open");
    setSequence(null);
    setMotionReady(false);
    from.current = {};
    to.current = {};
    onPose(boundedHandPose(definition));
  };
  return (
    <section
      className="hand-lab-panel"
      data-testid="hand-lab-panel"
      data-playing={String(playing)}
      data-sequence={sequence || "pose"}
    >
      <div className="hand-lab-heading">
        <span>HAND LAB / KINEMATICS</span>
        <h2>
          {definition.title?.[lang] ||
            t("四指手部实验", "Four-finger hand lab")}
        </h2>
      </div>
      <p>
        {definition.description?.[lang] ||
          t(
            "LEAP Hand V1 · 4 指 / 16 个源模型转动关节。不是 Shadow 五指手，也不是两指夹爪。",
            "LEAP Hand V1 · 4 digits / 16 source revolute joints. Not a five-finger Shadow hand or a two-finger gripper.",
          )}
      </p>
      <div className="hand-lab-boundary" role="note">
        {t(
          `仅运动学姿态示意：不验证碰撞、物体接触、抓牢、抓力或真机安全。${definition.license}仿真资源许可不等于制造 CAD、加工图或可打印性已获核验。`,
          `Kinematic poses only: no collision, contact, grasp success, grip force or hardware-safety verification. ${definition.license} simulation assets do not establish verified manufacturing CAD, drawings or printability.`,
        )}
      </div>
      {definition.licenseNote && (
        <p className="hand-license-note">{definition.licenseNote[lang]}</p>
      )}
      {!ready && (
        <p role="status" className="hand-lab-unverified">
          {t(
            "模型加载或映射核验尚未完成，控制已禁用。",
            "Model loading or source-map validation incomplete. Controls are disabled.",
          )}
        </p>
      )}
      <div
        className="hand-fingers"
        role="group"
        aria-label={t("选择手指", "Select digit")}
      >
        {[
          { id: "all", name: { zh: "全部", en: "All" } },
          { id: "palm", name: { zh: "手掌", en: "Palm" } },
          ...definition.fingers,
        ].map((f) => (
          <button
            type="button"
            key={f.id}
            aria-pressed={finger === f.id}
            disabled={!ready}
            onClick={() => choose(f.id)}
          >
            {f.name[lang]}
          </button>
        ))}
      </div>
      <small>
        {definition.groupNote?.[lang] ||
          t(
            "A/B/C 按 URDF 手掌分支顺序命名，未猜测食指/中指/无名指的人体对应关系。",
            "A/B/C follow the URDF palm-branch order; human index/middle/ring identities are not inferred.",
          )}
      </small>
      <div
        className="hand-independent"
        role="group"
        aria-label={t("独立手指开合", "Independent digit curl")}
      >
        <h3>
          {isLeap
            ? t("四指独立开合", "Independent digit curl")
            : t("五指独立驱动协调", "Five-digit drive coordination")}
        </h3>
        <small>
          {!isLeap
            ? t(
                "每条滑杆仅协调该指的独立驱动；源mimic从动轴会随动，不能独立驱动。全手张开轴是共享控制。有效限位同时约束所有从动轴。",
                "Each slider coordinates that digit's independent drives; source mimic followers remain coupled, not separately driven. Spread is shared. Effective limits also constrain every follower.",
              )
            : t(
                "每条滑杆仅协调该指的4个源关节，其他手指保持不动。100%为本站示意幅度；各轴完整源范围仍可在下方单独调整。",
                "Each slider coordinates only that digit's four source joints, preserving the others. 100% is the authored illustrative range; full per-axis source ranges remain below.",
              )}
        </small>
        {definition.fingers.map((f) => (
          <label key={f.id}>
            <span>
              {f.name[lang]}
              <output>
                {Math.round(
                  handFingerCurlLevel(definition, f.id, values) * 100,
                )}
                %
              </output>
            </span>
            <input
              type="range"
              min="0"
              max="1"
              step=".01"
              value={handFingerCurlLevel(definition, f.id, values)}
              disabled={!ready}
              aria-label={t(
                `${f.name.zh} 独立开合`,
                `${f.name.en} independent curl`,
              )}
              onChange={(e) => {
                onStop?.();
                setPlaying(false);
                setSequence(null);
                setMotionReady(false);
                setFinger(f.id);
                onHighlight(f.links, false);
                onPose(
                  setHandFingerCurl(
                    definition,
                    f.id,
                    Number(e.target.value),
                    values,
                  ),
                );
              }}
            />
          </label>
        ))}
      </div>
      <div
        className="hand-sequences"
        role="group"
        aria-label={t("连续动作示意", "Continuous illustrative motion")}
      >
        <button
          type="button"
          disabled={!ready}
          aria-pressed={sequence === "wave"}
          onClick={() => startSequence("wave")}
        >
          {t("逐指波浪", "Finger wave")}
        </button>
        <button
          type="button"
          disabled={!ready}
          aria-pressed={sequence === "opposition"}
          onClick={() => startSequence("opposition")}
        >
          {t("拇指逐指配合", "Thumb coordination tour")}
        </button>
      </div>
      <small>
        {t(
          "连续动作由本站编排，不是研究策略或已求解的接触动作；拇指配合不保证指尖相触。减少动态时呈现静态中间帧，可拖动进度。",
          "These are app-authored sequences, not research policies or solved contacts. Thumb coordination does not guarantee fingertip contact. Reduced motion shows a still midpoint; scrub to inspect.",
        )}
      </small>
      <label className="hand-speed">
        {t("播放速度", "Playback speed")}
        <select
          aria-label={t("手部播放速度", "Hand playback speed")}
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
        >
          <option value="0.5">0.5×</option>
          <option value="1">1×</option>
          <option value="1.5">1.5×</option>
          <option value="2">2×</option>
        </select>
      </label>
      <div
        className="hand-presets"
        role="group"
        aria-label={t("示意姿态", "Illustrative poses")}
      >
        {(
          [
            ["open", "张开示意", "Open pose"],
            ["fist", "握拳示意", "Curl pose"],
            ["pinch", "捏合示意", "Pinch pose"],
          ] as const
        ).map(([id, zh, en]) => (
          <button
            type="button"
            key={id}
            disabled={!ready}
            aria-pressed={!sequence && preset === id}
            onClick={() => start(id)}
          >
            {t(zh, en)}
          </button>
        ))}
      </div>
      <label className="hand-progress">
        {t("动作进度", "Pose progress")}
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={progress}
          disabled={!ready || !motionReady}
          aria-label={t("手部动作进度", "Hand pose progress")}
          onChange={(e) => seek(Number(e.target.value))}
        />
      </label>
      <div className="hand-playback">
        <button
          type="button"
          disabled={!ready || !motionReady || progress >= 1}
          onClick={() => {
            onStop?.();
            if (document.documentElement.dataset.reducedMotion === "true")
              seek(1);
            else setPlaying((v) => !v);
          }}
        >
          {playing ? t("暂停姿态", "Pause pose") : t("继续姿态", "Resume pose")}
        </button>
        <button type="button" disabled={!ready} onClick={reset}>
          {t("复位到源零位", "Reset to source zero")}
        </button>
      </div>
      <p className="hand-source-note">
        {t(
          isLeap
            ? "预设由本站编写并按源限位裁剪，不是官方抓取策略。零位是 URDF 零关节姿态，不是经认证的真机回零指令。模型为旋转抬高的展示位，不代表物理悬浮或支撑。"
            : "预设由本站编写并按源及耦合限位裁剪，不是官方抓取策略。零位是 URDF 零关节姿态，不是真机回零指令。展示坐标与地面适配不代表接触物理。",
          isLeap
            ? "Presets are app-authored and clamped to source limits, not official grasp policies. Zero is the URDF zero-joint pose, not a validated hardware homing command. The rotated/elevated display pose does not simulate levitation or support."
            : "Presets are app-authored and constrained by source and coupled limits, not official grasp policies. Zero is the URDF zero-joint pose, not hardware homing. Display coordinates and ground fitting do not simulate contact physics.",
        )}
      </p>
      <div className="hand-joints">
        {displayed.map((j) => (
          <label key={j.name} className="hand-joint">
            <span>
              <strong>
                {t("关节", "Joint")} {j.name}
              </strong>
              <output>
                {(((pose[j.name] || 0) * 180) / Math.PI).toFixed(1)}°
              </output>
            </span>
            <small>
              {j.parent} → {j.child}
            </small>
            <input
              type="range"
              min={handDriveLimits(definition, j.name).lower}
              max={handDriveLimits(definition, j.name).upper}
              step="0.005"
              value={pose[j.name] || 0}
              disabled={!ready}
              aria-label={t(`手部关节 ${j.name}`, `Hand joint ${j.name}`)}
              onChange={(e) => {
                onStop?.();
                setPlaying(false);
                setSequence(null);
                setMotionReady(false);
                onPose(
                  boundedHandPose(definition, {
                    ...values,
                    [j.name]: Number(e.target.value),
                  }),
                );
              }}
            />
            <small>
              {t("源限位", "Source limits")}: {j.lower} … {j.upper} rad
            </small>
            {followers.length > 0 && (
              <small>
                {t("耦合有效驱动范围", "Coupling-constrained drive range")}:{" "}
                {handDriveLimits(definition, j.name).lower.toFixed(5)} …{" "}
                {handDriveLimits(definition, j.name).upper.toFixed(5)} rad
              </small>
            )}
          </label>
        ))}
      </div>
      {finger === "palm" && (
        <p>
          {t(
            "手掌为固定基座，没有独立滑条。",
            "The palm is the fixed base; it has no independent slider.",
          )}
        </p>
      )}
      {followers.length > 0 && (
        <details className="hand-mimic-list">
          <summary>
            {t(
              `${followers.length} 个源耦合从动关节（只读）`,
              `${followers.length} source mimic followers (read-only)`,
            )}
          </summary>
          {followers.map((j) => (
            <p key={j.name}>
              <strong>{j.name}</strong>
              <br />
              {j.mimicSource?.joint} × {j.mimicSource?.multiplier} +{" "}
              {j.mimicSource?.offset}
              <br />
              {Number.isFinite(followerPose[j.name])
                ? followerPose[j.name].toFixed(4)
                : "—"}{" "}
              rad · [{j.lower}, {j.upper}]
            </p>
          ))}
        </details>
      )}
      {isLeap ? (
        <aside className="hand-research-card">
          <h3>
            {t(
              "研究路线：从姿态到接触操作",
              "Research path: poses to contact manipulation",
            )}
          </h3>
          <p>
            {t(
              "LEAP Hand（RSS 2023）官方仿真库包含手内旋转预训练策略、稳定抓握缓存与 sim2real 代码，适合可复现研究。接触建模 → 稳定抓握 → 手内旋转 → 扰动恢复，是后续研究路线，不是本页已完成能力。",
              "The LEAP Hand (RSS 2023) simulation repository provides a pretrained in-hand rotation policy, stable-grasp caches and sim2real code for reproducible research. Contact modeling → stable grasp → in-hand rotation → disturbance recovery is a research path, not this page's implemented capability.",
            )}
          </p>
          <strong>
            {t(
              "当前：源关节、独立开合与编排姿态。未接入接触物理或训练策略。",
              "Current: source joints, independent curl and authored motion. Contact physics and trained policies are not integrated.",
            )}
          </strong>
          <a
            href="https://github.com/leap-hand/LEAP_Hand_Sim"
            target="_blank"
            rel="noreferrer"
          >
            {t(
              "官方研究代码与复现说明",
              "Official research code and reproduction guide",
            )}{" "}
            ↗
          </a>
        </aside>
      ) : (
        <aside className="hand-research-card">
          <h3>
            {t(
              "研究重点：独立驱动与机械耦合",
              "Research focus: independent drives and coupling",
            )}
          </h3>
          <p>
            {t(
              "用9个独立源驱动观察20个可动关节的五指协调，检查11个mimic关系和有效限位。当前仅运动学，不包含接触物理、抓取策略、抓力或硬件控制；源模型部分辅助几何为估计值。",
              "Observe five-digit coordination of 20 moving joints through nine source drives, 11 mimic relationships and effective bounds. Kinematics only: no contact physics, grasp policies, grip force or hardware control. Some source helper geometry is estimated.",
            )}
          </p>
        </aside>
      )}
      <footer>
        <a href={definition.sourceUrl} target="_blank" rel="noreferrer">
          {t("固定版本 URDF 来源", "Pinned URDF source")} ↗
        </a>
        <small>
          {definition.license} · {definition.revision.slice(0, 12)}
        </small>
        {definition.sourcePackageUrl && (
          <a href={siteAsset(definition.sourcePackageUrl)} download>
            {t(
              "下载完整对应模型源与转换说明（GPL）",
              "Download corresponding model source and conversion notes (GPL)",
            )}
          </a>
        )}
      </footer>
    </section>
  );
}
