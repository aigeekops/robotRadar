import { useEffect, useRef, useState } from "react";
import "./styles/gripperLab.css";
import type { Lang, ModelInfo } from "./types";
import {
  gripperRange,
  gripperCommand,
  nominalOpening,
} from "./core/gripperLab";
export default function GripperLabPanel({
  lang,
  info,
  values,
  onPose,
  onHighlight,
  onStop,
}: {
  lang: Lang;
  info: ModelInfo;
  values: Record<string, number>;
  onPose: (v: Record<string, number>) => void;
  onHighlight?: (links: string[], focus: boolean) => void;
  onStop?: () => void;
}) {
  const t = (zh: string, en: string) => (lang === "zh" ? zh : en);
  const r = gripperRange(info);
  const width = nominalOpening(info, values);
  const [moving, setMoving] = useState(false);
  const frame = useRef(0);
  const current = useRef(width ?? 0);
  current.current = width ?? 0;
  const stop = () => {
    cancelAnimationFrame(frame.current);
    setMoving(false);
    onStop?.();
  };
  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
    },
    [],
  );
  const set = (w: number) => {
    const command = gripperCommand(info, w);
    if (command) onPose(command);
  };
  const move = (target: number) => {
    stop();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      set(target);
      return;
    }
    const start = performance.now(),
      from = current.current;
    setMoving(true);
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 650);
      set(from + (target - from) * (p * p * (3 - 2 * p)));
      if (p < 1) frame.current = requestAnimationFrame(tick);
      else setMoving(false);
    };
    frame.current = requestAnimationFrame(tick);
  };
  return (
    <section className="gripper-lab" data-testid="gripper-lab">
      <header className="gripper-heading">
        <span>FRANKA HAND · KINEMATICS</span>
        <h3>{t("两指平行夹爪实验", "Parallel gripper lab")}</h3>
      </header>
      <p>
        {t(
          "1个主驱动 → URDF mimic → 对向从指。原轴线、原限位，不发送实体指令。",
          "One master → URDF mimic → opposing follower. Source axes and limits; no hardware commands.",
        )}
      </p>
      {r && width !== null ? (
        <>
          <label className="gripper-opening">
            {t("标称开口（相向行程）", "Nominal opening (opposing travel)")}{" "}
            <output>{(width * 1000).toFixed(1)} mm</output>
            <input
              aria-label={t("夹爪标称开口", "Nominal gripper opening")}
              type="range"
              min={r.lower * 2}
              max={r.upper * 2}
              step="0.001"
              value={width}
              onChange={(e) => {
                stop();
                set(Number(e.target.value));
              }}
            />
          </label>
          <div className="gripper-actions">
            <button
              className="gripper-primary"
              onClick={() => move(r.upper * 2)}
            >
              {t("张开", "Open")}
            </button>
            <button
              className="gripper-primary"
              onClick={() => move(r.lower * 2)}
            >
              {t("闭合", "Close")}
            </button>
            <button
              onClick={() => {
                stop();
                set(r.lower * 2);
              }}
            >
              {t("复位", "Reset")}
            </button>
            <button onClick={stop} disabled={!moving}>
              {t("暂停", "Pause")}
            </button>
            <button
              onClick={() =>
                onHighlight?.(["fr3_leftfinger", "fr3_rightfinger"], true)
              }
            >
              {t("观察双指", "Inspect fingers")}
            </button>
          </div>
        </>
      ) : (
        <p role="status">
          {t(
            "等待匹配的原始平移关节，未向未知关节发命令。",
            "Waiting for matching source prismatic joints; no commands sent to unknown joints.",
          )}
        </p>
      )}
      <p>
        {t(
          "开口=2×主指位移，仅来自该URDF的对称关系；不是测量得到的接触间隙。",
          "Opening = 2 × master displacement from this URDF symmetry, not measured contact clearance.",
        )}
      </p>
      <div className="gripper-tasks">
        <h4>{t("工业任务如何拆解", "Decomposing industrial tasks")}</h4>
        <ol>
          <li>
            {t(
              "取放：先检查工件尺寸、接近姿态与开口，再规划移动。",
              "Pick-and-place: check part dimensions, approach pose and opening before motion.",
            )}
          </li>
          <li>
            {t(
              "机床上下料：区分夹爪就位、工件约束、机床互锁和故障恢复。",
              "Machine tending: distinguish positioning, workpiece constraints, machine interlocks and recovery.",
            )}
          </li>
          <li>
            {t(
              "本实验只显示姿态，未验证真实夹持成功。",
              "This lab displays poses only, not verified grasp success.",
            )}
          </li>
        </ol>
      </div>
      <p>
        {t(
          "对照：Robotiq 2F-85为自适应两指机构，不能把本平行夹爪改名充当。",
          "Contrast: Robotiq 2F-85 is adaptive two-finger hardware, not a rename of this parallel mechanism.",
        )}
      </p>
      <p className="gripper-boundary">
        {t(
          "没有接触/摩擦求解、力传感或负载测试；力、负载与硬件接口未知，不补假数。",
          "No contact/friction solver, force sensing or payload testing. Force, payload and hardware interfaces are not inferred.",
        )}
      </p>
    </section>
  );
}
