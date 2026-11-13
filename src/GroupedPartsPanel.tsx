import { useEffect, useMemo, useRef, useState } from "react";
import {
  adaptUrdfVisuals,
  type UrdfVisualAdaptation,
} from "./core/urdfVisualEvidence";
import type { VisualDisplayGroup } from "./core/visualGrouping";
import { siteAsset } from "./siteAssets";
import type { Lang, RobotEntry } from "./types";
import "./styles/groupedParts.css";
export type GroupedPartsEvidence = {
  robotId: string;
  sourceCommit: string;
  groups: VisualDisplayGroup[];
  /** Only exact duplicate instance IDs. Never suppress reference/unsupported singletons. */
  suppressedIds: string[];
};
export type GroupedPartsPanelProps = {
  robot: RobotEntry;
  lang: Lang;
  selected?: string | null;
  grouped?: boolean;
  onSelect: (instanceId: string) => void;
  onDisplayChange: (
    display: GroupedPartsEvidence & {
      enabled: boolean;
      hiddenInstanceIds: string[];
    },
  ) => void;
  /** Called with null while loading/error; verify robotId before applying to a scene. */
  onEvidence?: (evidence: GroupedPartsEvidence | null) => void;
};
export default function GroupedPartsPanel({
  robot,
  lang,
  selected = null,
  grouped = false,
  onSelect,
  onDisplayChange,
  onEvidence,
}: GroupedPartsPanelProps) {
  const t = (zh: string, en: string) => (lang === "zh" ? zh : en);
  const key = JSON.stringify([robot.id, robot.sourceCommit, robot.urdfUrl]);
  const [loaded, setLoaded] = useState<{
      key: string;
      data?: UrdfVisualAdaptation;
      error?: boolean;
    }>({ key: "" }),
    [retry, setRetry] = useState(0);
  const callback = useRef(onEvidence);
  callback.current = onEvidence;
  useEffect(() => {
    const abort = new AbortController();
    setLoaded({ key });
    callback.current?.(null);
    fetch(siteAsset(robot.urdfUrl), { signal: abort.signal })
      .then((r) => {
        if (!r.ok) throw Error("Source unavailable");
        return r.text();
      })
      .then((xml) => {
        const data = adaptUrdfVisuals(xml, {
          robotId: robot.id,
          sourceCommit: robot.sourceCommit || "",
          urdfUri: robot.urdfUrl,
        });
        if (abort.signal.aborted) return;
        setLoaded({ key, data });
        callback.current?.({
          robotId: robot.id,
          sourceCommit: robot.sourceCommit!,
          groups: data.groups,
          suppressedIds: data.groups.flatMap((g) =>
            g.instances.slice(1).map((i) => i.instanceId),
          ),
        });
      })
      .catch(() => {
        if (!abort.signal.aborted) {
          setLoaded({ key, error: true });
          callback.current?.(null);
        }
      });
    return () => abort.abort();
  }, [key, retry, robot.id, robot.sourceCommit, robot.urdfUrl]);
  const data = loaded.key === key ? loaded.data : undefined;
  const excluded = new Map(
    data?.exclusions.map((x) => [x.instanceId, x.reason]),
  );
  const drawable =
    data?.groups.filter(
      (g) =>
        g.representative.visuals.length > 0 ||
        excluded.get(g.representative.instanceId) !== "No visual geometry",
    ) || [];
  const evidence: GroupedPartsEvidence | undefined = useMemo(
    () =>
      data
        ? {
            robotId: robot.id,
            sourceCommit: robot.sourceCommit!,
            groups: data.groups,
            suppressedIds: data.groups.flatMap((g) =>
              g.instances.slice(1).map((i) => i.instanceId),
            ),
          }
        : undefined,
    [data, robot.id, robot.sourceCommit],
  );
  const rows = grouped
    ? drawable
    : drawable.flatMap((g) =>
        g.instances.map((instance) => ({
          ...g,
          id: `instance:${instance.instanceId}`,
          representative: instance,
          instances: [instance],
          quantity: 1,
        })),
      );
  const count = drawable.reduce((n, g) => n + g.quantity, 0),
    duplicates = drawable.filter((g) => g.quantity > 1).length;
  return (
    <section
      className="grouped-parts"
      data-testid="grouped-parts"
      aria-label={t("源零件归类", "Source part grouping")}
    >
      <header>
        <div>
          <small>{t("探索工作台 · 归类", "EXPLORE · GROUPING")}</small>
          <h3>{t("代表件与真实实例", "Representatives & source instances")}</h3>
        </div>
      </header>
      <p className="gp-boundary">
        {t(
          "只归并同源视觉几何，不代表实物可互换。左右、镜像、局部形状不同的部件分别保留；组装仍使用每一个原实例。",
          "Groups identical source visual geometry only, not interchangeable physical parts. Left/right, mirrored and locally different shapes stay separate. Assembly retains every original instance.",
        )}
      </p>
      <div
        className="gp-mode"
        role="group"
        aria-label={t("零件显示模式", "Part display mode")}
      >
        <button
          type="button"
          aria-pressed={!grouped}
          disabled={!evidence}
          onClick={() =>
            evidence &&
            onDisplayChange({
              ...evidence,
              enabled: false,
              hiddenInstanceIds: [],
            })
          }
        >
          {t("全部实例", "All instances")}
        </button>
        <button
          type="button"
          aria-pressed={grouped}
          disabled={!evidence}
          onClick={() =>
            evidence &&
            onDisplayChange({
              ...evidence,
              enabled: true,
              hiddenInstanceIds: evidence.suppressedIds,
            })
          }
        >
          {t("代表件 × 数量", "Representatives × quantity")}
        </button>
      </div>
      {!data && !loaded.error && (
        <p role="status">
          {t("正在核对源视觉定义…", "Checking source visual definitions…")}
        </p>
      )}
      {loaded.key === key && loaded.error && (
        <div role="alert">
          <p>
            {t(
              "无法读取固定版本源模型，未生成猜测归类。",
              "Could not read the pinned source model. No guessed groups were generated.",
            )}
          </p>
          <button type="button" onClick={() => setRetry((x) => x + 1)}>
            {t("重试零件归类", "Retry part grouping")}
          </button>
        </div>
      )}
      {data && (
        <>
          <p className="gp-count" data-testid="grouped-parts-count">
            {t(
              `${count} 个可视源实例 · ${drawable.length} 个代表件 · ${duplicates} 组重复`,
              `${count} visual source instances · ${drawable.length} representatives · ${duplicates} repeated groups`,
            )}
          </p>
          {duplicates === 0 && (
            <p className="gp-note">
              {t(
                "当前模型没有满足严格条件的重复件，不会为了归类合并近似部件。",
                "No duplicates meet the strict criteria in this model; similar-looking parts are not merged.",
              )}
            </p>
          )}
          <div className="gp-list">
            {rows.map((g) => (
              <article
                className={`gp-card ${g.instances.some((i) => i.instanceId === selected) ? "selected" : ""}`}
                key={g.id}
                data-testid="grouped-part-card"
              >
                <button
                  type="button"
                  className="gp-select"
                  aria-label={t(
                    `选择${grouped ? "代表件" : "实例"} ${g.representative.instanceId}`,
                    `Select ${grouped ? "representative" : "instance"} ${g.representative.instanceId}`,
                  )}
                  onClick={() => onSelect(g.representative.instanceId)}
                >
                  <code>{g.representative.instanceId}</code>
                  <strong>× {g.quantity}</strong>
                </button>
                {g.basis === "unverified-singleton" && (
                  <small>
                    {t(
                      "证据不足，独立保留",
                      "Insufficient grouping evidence; kept separate",
                    )}
                  </small>
                )}
                <details>
                  <summary>
                    {t(
                      `来源与 ${g.quantity} 个实例`,
                      `Source & ${g.quantity} instance${g.quantity === 1 ? "" : "s"}`,
                    )}
                  </summary>
                  <ul>
                    {g.instances.map((i) => (
                      <li key={i.instanceId}>
                        <button
                          type="button"
                          aria-pressed={i.instanceId === selected}
                          onClick={() => {
                            if (grouped && evidence)
                              onDisplayChange({
                                ...evidence,
                                enabled: false,
                                hiddenInstanceIds: [],
                              });
                            onSelect(i.instanceId);
                          }}
                          aria-label={t(
                            `定位原实例 ${i.instanceId}`,
                            `Locate original instance ${i.instanceId}`,
                          )}
                        >
                          {i.instanceId}
                        </button>
                      </li>
                    ))}
                  </ul>
                  {g.representative.visuals.map((v, index) => (
                    <code className="gp-uri" key={index}>
                      {v.meshUri}
                    </code>
                  ))}
                </details>
              </article>
            ))}
          </div>
          <p className="gp-note">
            {t(
              `${data.instances.length - count} 个无可视几何的源参考节点未作为零件卡展示，仍保留在结构树中。`,
              `${data.instances.length - count} source reference nodes without visual geometry are omitted from cards and retained in the structure tree.`,
            )}
          </p>
          <a href={robot.sourceUrl} target="_blank" rel="noreferrer">
            {t("查看模型来源", "View model source")}
          </a>
          <code className="gp-revision">{robot.sourceCommit}</code>
        </>
      )}
    </section>
  );
}
