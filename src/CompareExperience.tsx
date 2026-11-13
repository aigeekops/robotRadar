import { useEffect, useState } from "react";
import RobotViewer from "./viewer/RobotViewer";
import type { Lang, RobotEntry } from "./types";
import { siteAsset } from "./siteAssets";
import "./styles/compareExperience.css";

type Stats = {
  configuration: string;
  links: number;
  visualLinks: number;
  joints: number;
  fixed: number;
  independent: number;
  mimic: number;
  types: string;
  limits: number;
};
type Evidence = { data?: Stats; error?: boolean };
const empty: string[] = [];
const jointValues = {};
export default function CompareExperience({
  robots,
  lang,
  onExplore,
}: {
  robots: RobotEntry[];
  lang: Lang;
  onExplore?: (robotId: string) => void;
}) {
  const [left, setLeft] = useState("g1");
  const [right, setRight] = useState("h1");
  const [view, setView] = useState("hero");
  const [viewToken, setViewToken] = useState(0);
  const [explode, setExplode] = useState(0);
  const [different, setDifferent] = useState(false);
  const [evidence, setEvidence] = useState<Record<string, Evidence>>({});
  const [selection, setSelection] = useState<Record<string, string | null>>({});
  const t = (zh: string, en: string) => (lang === "zh" ? zh : en);
  const a = robots.find((r) => r.id === left) || robots[0];
  const b = robots.find((r) => r.id === right) || robots[1] || robots[0];
  useEffect(() => {
    const controller = new AbortController();
    for (const robot of [a, b]) {
      if (!robot) continue;
      fetch(siteAsset(robot.urdfUrl), { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw Error("URDF unavailable");
          const xml = new DOMParser().parseFromString(
            await response.text(),
            "application/xml",
          );
          if (
            xml.querySelector("parsererror") ||
            xml.documentElement.tagName !== "robot"
          )
            throw Error("Invalid URDF");
          const nodes = Array.from(xml.documentElement.children);
          const links = nodes.filter((n) => n.tagName === "link");
          const joints = nodes.filter((n) => n.tagName === "joint");
          const types: Record<string, number> = {};
          for (const joint of joints) {
            const type = joint.getAttribute("type") || "unknown";
            types[type] = (types[type] || 0) + 1;
          }
          const movable = joints.filter(
            (n) =>
              n.getAttribute("type") !== "fixed" && !n.querySelector("mimic"),
          );
          const data: Stats = {
            configuration: xml.documentElement.getAttribute("name") || "—",
            links: links.length,
            visualLinks: links.filter((n) => n.querySelector("visual")).length,
            joints: joints.length,
            fixed: types.fixed || 0,
            independent: movable.length,
            mimic: joints.filter((n) => n.querySelector("mimic")).length,
            types: Object.entries(types)
              .sort()
              .map(([key, count]) => `${key}: ${count}`)
              .join(" · "),
            limits: movable.filter((n) => {
              const l = n.querySelector("limit");
              return l?.hasAttribute("lower") && l.hasAttribute("upper");
            }).length,
          };
          if (!controller.signal.aborted)
            setEvidence((previous) => ({ ...previous, [robot.id]: { data } }));
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setEvidence((previous) => ({
              ...previous,
              [robot.id]: { error: true },
            }));
        });
    }
    return () => controller.abort();
  }, [a?.id, a?.urdfUrl, b?.id, b?.urdfUrl]);
  if (!a || !b)
    return <p>{t("正在读取机型目录…", "Loading model catalog…")}</p>;
  const stat = (robot: RobotEntry, key: keyof Stats) => {
    const item = evidence[robot.id];
    return item?.data
      ? String(item.data[key])
      : item?.error
        ? t("读取失败，未核实", "Unavailable, unverified")
        : t("读取中…", "Loading…");
  };
  const forms: Record<string, string> = {
    humanoid: t("人形", "Humanoid"),
    quadruped: t("四足", "Quadruped"),
    manipulator: t("机械臂", "Manipulator"),
    mobile: t("移动机器人", "Mobile robot"),
  };
  const rows: { label: string; values: string[]; key: string }[] = [
    {
      key: "manufacturer",
      label: t("制造商 / 项目", "Manufacturer / project"),
      values: [a.manufacturer, b.manufacturer],
    },
    {
      key: "form",
      label: t("形态", "Form"),
      values: [a, b].map((r) => forms[r.form] || r.form),
    },
    ...(
      [
        ["configuration", "URDF 配置名", "URDF configuration"],
        ["links", "连杆总数", "Total links"],
        ["visualLinks", "含可视几何的连杆", "Links with visuals"],
        ["joints", "关节总数（含固定）", "All joints (including fixed)"],
        ["independent", "非固定且非 mimic 关节", "Non-fixed, non-mimic joints"],
        ["fixed", "固定关节", "Fixed joints"],
        ["mimic", "耦合关节（mimic）", "Mimic joints"],
        ["types", "关节类型分布", "Joint type counts"],
        [
          "limits",
          "声明上下限的独立关节",
          "Independent joints with lower/upper limits",
        ],
      ] as const
    ).map(([key, zh, en]) => ({
      key,
      label: t(zh, en),
      values: [a, b].map((r) => stat(r, key)),
    })),
    {
      key: "license",
      label: t("资源许可", "Asset license"),
      values: [a.license, b.license],
    },
    {
      key: "scope",
      label: t("已核实范围", "Verified scope"),
      values: [a.verifiedScope[lang], b.verifiedScope[lang]],
    },
    {
      key: "limits-note",
      label: t("模型局限", "Model limitations"),
      values: [a.limitations[lang], b.limitations[lang]],
    },
    {
      key: "physical",
      label: t("真机重量 / 载重 / 价格", "Physical mass / payload / price"),
      values: [a, b].map(() =>
        t(
          "未在此核实，不从网格或 URDF 推断",
          "Not verified here; not inferred from meshes or URDF",
        ),
      ),
    },
  ];
  return (
    <main className="compare-experience" data-testid="compare-experience">
      <header>
        <div className="eyebrow">SIDE BY SIDE / SOURCE-BASED</div>
        <h1>
          {t(
            "先看结构，再比差异。",
            "See the structure. Compare the evidence.",
          )}
        </h1>
        <p>
          {t(
            "同时观察两台源模型。预设视角与拆分幅度同步；拖动、缩放各自独立。模型分别适配画框，不代表相同比例或真机尺寸。",
            "Observe two source models. Preset views and separation are synchronized; orbit and zoom are independent. Each model fits its frame, not a shared physical scale.",
          )}
        </p>
      </header>
      <div
        className="compare-toolbar"
        role="group"
        aria-label={t("同步观察", "Synchronized observation")}
      >
        {[
          ["hero", "立体", "3D"],
          ["front", "正面", "Front"],
          ["side", "侧面", "Side"],
          ["back", "背面", "Back"],
          ["top", "顶部", "Top"],
        ].map(([id, zh, en]) => (
          <button
            type="button"
            key={id}
            aria-pressed={view === id}
            onClick={() => {
              setView(id);
              setViewToken((n) => n + 1);
            }}
          >
            {t(zh, en)}
          </button>
        ))}
        <label>
          {t("同步拆分", "Separate both")}
          <input
            aria-label={t("对比拆分幅度", "Comparison separation")}
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={explode}
            onChange={(e) => setExplode(Number(e.target.value))}
          />
        </label>
        <button
          type="button"
          onClick={() => {
            setView("hero");
            setViewToken((n) => n + 1);
            setExplode(0);
            setSelection({});
          }}
        >
          {t("重置观察", "Reset views")}
        </button>
      </div>
      <div className="compare-stages">
        {[a, b].map((robot, index) => (
          <section
            className="compare-stage"
            key={index}
            data-testid={`compare-slot-${index}`}
          >
            <label>
              <span>
                {index === 0 ? t("机型 A", "Model A") : t("机型 B", "Model B")}
              </span>
              <select
                aria-label={
                  index === 0
                    ? t("对比机型 A", "Compare model A")
                    : t("对比机型 B", "Compare model B")
                }
                value={robot.id}
                onChange={(e) => {
                  (index === 0 ? setLeft : setRight)(e.target.value);
                  setSelection((previous) => ({ ...previous, [index]: null }));
                }}
              >
                {robots.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name[lang]}
                  </option>
                ))}
              </select>
            </label>
            <div className="compare-canvas">
              <RobotViewer
                key={robot.id}
                url={robot.urdfUrl}
                lang={lang}
                selected={selection[index] || null}
                hidden={empty}
                jointValues={jointValues}
                explode={explode}
                view={view}
                viewToken={viewToken}
                resetToken={0}
                onSelect={(part) =>
                  setSelection((previous) => ({ ...previous, [index]: part }))
                }
                onLoaded={() => {}}
              />
            </div>
            <p className="compare-selection">
              {selection[index]
                ? `${t("选中连杆", "Selected link")}: ${selection[index]}`
                : t(
                    "点击模型查看连杆名称 · 拖动旋转 · 滚轮缩放",
                    "Click a link · Drag to orbit · Scroll to zoom",
                  )}
            </p>
            <nav>
              <a href={robot.sourceUrl} target="_blank" rel="noreferrer">
                {t("模型来源", "Model source")} ↗
              </a>
              <a
                href={siteAsset(robot.urdfUrl)}
                target="_blank"
                rel="noreferrer"
              >
                URDF ↗
              </a>
              {robot.provenanceUrl && (
                <a
                  href={siteAsset(robot.provenanceUrl)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("来源审计", "Provenance")} ↗
                </a>
              )}
              {onExplore && (
                <button
                  type="button"
                  className="compare-explore"
                  onClick={() => onExplore(robot.id)}
                >
                  {t("探索此机型", "Explore this model")} →
                </button>
              )}
            </nav>
          </section>
        ))}
      </div>
      <section className="compare-data">
        <div className="compare-data-heading">
          <h2>{t("可核实的模型维度", "Verifiable model dimensions")}</h2>
          <label>
            <input
              type="checkbox"
              checked={different}
              onChange={(e) => setDifferent(e.target.checked)}
            />
            {t("仅看不同项", "Differences only")}
          </label>
        </div>
        <p>
          {t(
            "数量直接读取当前 URDF。独立可动关节数不是整机自由度认证；连杆数不是零件清单，拆分仅为可视解释。未核实的实物指标始终保留提示。",
            "Counts are read from the selected URDF. Independent joint count is not certified robot DOF; links are not a parts BOM. Separation is illustrative. Unverified physical specifications remain explicitly marked.",
          )}
        </p>
        <table>
          <thead>
            <tr>
              <th>{t("维度", "Dimension")}</th>
              <th>{a.name[lang]}</th>
              <th>{b.name[lang]}</th>
            </tr>
          </thead>
          <tbody>
            {rows
              .filter(
                (row) =>
                  !different ||
                  row.values[0] !== row.values[1] ||
                  row.key === "physical",
              )
              .map((row) => (
                <tr
                  key={row.key}
                  data-metric={row.key}
                  className={
                    row.values[0] !== row.values[1] ? "compare-difference" : ""
                  }
                >
                  <th scope="row">{row.label}</th>
                  {row.values.map((value, index) => (
                    <td key={index}>{value}</td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
