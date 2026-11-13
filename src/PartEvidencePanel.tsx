import { siteAsset } from "./siteAssets";
import { useEffect, useState } from "react";
import {
  parsePartEvidence,
  type RobotEvidence,
  type JointEvidence,
} from "./core/partEvidence";
import { robotLessons } from "./robotLearning";
import { pinnedRobotSource } from "./core/pinnedRobotSource";
import type { Lang, RobotEntry } from "./types";
type Props = {
  robot: RobotEntry;
  part: string;
  lang: Lang;
  onSelect: (part: string) => void;
  onLesson: (id: string) => void;
};
export default function PartEvidencePanel({
  robot,
  part,
  lang,
  onSelect,
  onLesson,
}: Props) {
  const t = (zh: string, en: string) => (lang === "zh" ? zh : en);
  const [state, setState] = useState<{
    url: string;
    data?: RobotEvidence;
    error?: boolean;
  }>({ url: "" });
  useEffect(() => {
    const controller = new AbortController();
    setState({ url: robot.urdfUrl });
    fetch(siteAsset(robot.urdfUrl), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw Error("URDF unavailable");
        const text = await response.text();
        const data = parsePartEvidence(text);
        if (!controller.signal.aborted) setState({ url: robot.urdfUrl, data });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setState({ url: robot.urdfUrl, error: true });
      });
    return () => controller.abort();
  }, [robot.urdfUrl]);
  const evidence =
    state.url === robot.urdfUrl ? state.data?.links[part] : undefined;
  const unknown = t(
    "未知（源字段缺失或无效）",
    "Unknown (missing or invalid source field)",
  );
  const format = (value: number | null) =>
    value === null ? unknown : String(value);
  const source = pinnedRobotSource(robot);
  function joint(j: JointEvidence) {
    const fixed = j.type === "fixed",
      continuous = j.type === "continuous";
    return (
      <li key={j.name} data-testid="evidence-joint">
        <strong>{j.name}</strong> · {j.type}
        <p>
          <button
            className="text-button"
            onClick={() => onSelect(j.parent)}
            data-testid="evidence-parent"
          >
            {j.parent}
          </button>{" "}
          →{" "}
          <button
            className="text-button"
            onClick={() => onSelect(j.child)}
            data-testid="evidence-child"
          >
            {j.child}
          </button>
        </p>
        <p>
          {t("轴（关节局部坐标）", "Axis (joint-local frame)")}:{" "}
          {fixed
            ? t("不适用", "Not applicable")
            : (j.axis?.join(", ") ?? unknown)}
        </p>
        <p>
          {t("位置限位", "Position limits")}:{" "}
          {fixed
            ? t("不适用", "Not applicable")
            : continuous
              ? t(
                  "连续旋转，无位置上下界",
                  "Continuous rotation; no position bounds",
                )
              : j.unit
                ? `${format(j.lower)} … ${format(j.upper)} ${j.unit}`
                : unknown}
        </p>
      </li>
    );
  }
  return (
    <section
      className="part-evidence"
      data-testid="part-evidence-panel"
      aria-label={t("连杆证据卡", "Link evidence card")}
    >
      <h4>{t("连杆证据卡", "Link evidence card")}</h4>
      <p data-testid="evidence-disclaimer">
        {t(
          "以下是当前 URDF 的模型描述，不是实测整机质量，也不是已验证内部零件知识。",
          "These are current URDF model descriptions, not measured whole-robot mass or verified internal-component knowledge.",
        )}
      </p>
      <code data-testid="evidence-link-id">{part}</code>
      {state.url === robot.urdfUrl && state.error ? (
        <p role="alert" data-testid="evidence-error">
          {t(
            "无法读取有效的 URDF 证据。未以零值替代。切换机型后可重试。",
            "Valid URDF evidence could not be loaded. No zero values substituted. Switch models to retry.",
          )}
        </p>
      ) : !state.data || state.url !== robot.urdfUrl ? (
        <p role="status">{t("正在读取 URDF…", "Reading URDF…")}</p>
      ) : !evidence ? (
        <p data-testid="evidence-unknown">
          {t(
            "源模型中未找到此连杆。",
            "This link was not found in the source model.",
          )}
        </p>
      ) : (
        <>
          <dl>
            <dt>visual / collision</dt>
            <dd data-testid="evidence-geometry">
              {evidence.visualCount} / {evidence.collisionCount}
            </dd>
            <dt>
              {t(
                "此连杆 inertial 质量（kg）",
                "This link’s inertial mass (kg)",
              )}
            </dt>
            <dd data-testid="evidence-mass">{format(evidence.massKg)}</dd>
            <dt>
              {t(
                "inertial 原点 xyz（连杆坐标，m）",
                "Inertial origin xyz (link frame, m)",
              )}
            </dt>
            <dd data-testid="evidence-com">
              {evidence.centerOfMassM?.join(", ") ?? unknown}
            </dd>
          </dl>
          <small>
            {t(
              "重心仅按源惯性原点报告；未提供时不推断为零。质量不加总为整机。",
              "Center of mass is reported only from the source inertial origin; missing values are not inferred as zero. Mass is not summed into a robot total.",
            )}
          </small>
          <h5>{t("上游关节", "Upstream joint")}</h5>
          {evidence.upstream.length ? (
            <ul>{evidence.upstream.map(joint)}</ul>
          ) : (
            <p>
              {t(
                "无上游关节（模型根连杆）",
                "No upstream joint (model root link)",
              )}
            </p>
          )}
          <h5>{t("下游关节", "Downstream joints")}</h5>
          {evidence.downstream.length ? (
            <ul>{evidence.downstream.map(joint)}</ul>
          ) : (
            <p>
              {t(
                "无下游关节（模型叶连杆）",
                "No downstream joint (model leaf link)",
              )}
            </p>
          )}
          {robotLessons
            .filter((l) => l.robotId === robot.id && l.partIds.includes(part))
            .map((l) => (
              <button
                key={l.id}
                className="text-button"
                data-testid="evidence-lesson"
                onClick={() => onLesson(l.id)}
              >
                {l.title[lang]} →
              </button>
            ))}
        </>
      )}
      <div className="evidence-sources">
        <a href={siteAsset(robot.urdfUrl)} target="_blank" rel="noreferrer">
          {t("当前原始 URDF", "Current raw URDF")}
        </a>
        {robot.provenanceUrl && (
          <a
            href={siteAsset(robot.provenanceUrl)}
            target="_blank"
            rel="noreferrer"
          >
            {t("来源与哈希记录", "Provenance and hashes")}
          </a>
        )}
        {source && (
          <a href={source} target="_blank" rel="noreferrer">
            {t("固定版本官方源文件", "Pinned official source")}
          </a>
        )}
      </div>
      <small>{robot.sourceCommit}</small>
    </section>
  );
}
