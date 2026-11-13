import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  ArrowUpRight,
  Box,
  ChevronDown,
  ChevronRight,
  Eye,
  Focus,
  Layers3,
  RotateCcw,
  Search,
  Workflow,
  Wrench,
  X,
} from "lucide-react";
import { parsePartEvidence } from "./core/partEvidence";
import {
  buildStructureTree,
  searchStructureTree,
  structureAncestors,
  structureLabel,
  structureLessonIds,
  structureRows,
  visibleVisualCount,
  type StructureTree,
} from "./core/structureTree";
import { robotLessons } from "./robotLearning";
import { siteAsset } from "./siteAssets";
import type { Lang, RobotEntry } from "./types";
import "./styles/structureNavigator.css";
export type StructureBranchAction = "highlight" | "isolate" | "focus";
export type StructureAssemblyContext = {
  robotId: string;
  partId: string;
  branchIds: string[];
  sourceCommit: string | null;
};
export type StructureNavigatorProps = {
  robot: RobotEntry;
  lang: Lang;
  selected: string | null;
  hidden?: readonly string[];
  onSelect: (partId: string) => void;
  onBranch: (ids: string[], action: StructureBranchAction) => void;
  onRestore: () => void;
  onLesson?: (lessonId: string) => void;
  onAssemble?: (context: StructureAssemblyContext) => void;
};
export default function StructureNavigator({
  robot,
  lang,
  selected,
  hidden = [],
  onSelect,
  onBranch,
  onRestore,
  onLesson,
  onAssemble,
}: StructureNavigatorProps) {
  const t = (zh: string, en: string) => (lang === "zh" ? zh : en);
  const [state, setState] = useState<{
    url: string;
    tree?: StructureTree;
    error?: boolean;
  }>({ url: "" });
  const [retry, setRetry] = useState(0),
    [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  useEffect(() => {
    const controller = new AbortController();
    setState({ url: robot.urdfUrl });
    setQuery("");
    setExpanded(new Set());
    fetch(siteAsset(robot.urdfUrl), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw Error("Source unavailable");
        const tree = buildStructureTree(
          parsePartEvidence(await response.text()),
        );
        if (!controller.signal.aborted) {
          setState({ url: robot.urdfUrl, tree });
          setExpanded(new Set(tree.roots));
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setState({ url: robot.urdfUrl, error: true });
      });
    return () => controller.abort();
  }, [robot.urdfUrl, retry]);
  const tree = state.url === robot.urdfUrl ? state.tree : undefined;
  const labels = useMemo(
    () =>
      Object.fromEntries(
        Object.keys(tree?.nodes || {}).map((id) => [
          id,
          structureLabel(id, lang),
        ]),
      ),
    [tree, lang],
  );
  const search = useMemo(
    () => (tree ? searchStructureTree(tree, query, labels) : undefined),
    [tree, query, labels],
  );
  const rows = useMemo(
    () => (tree ? structureRows(tree, expanded, search) : []),
    [tree, expanded, search],
  );
  const active = tree
    ? selected && Object.hasOwn(tree.nodes, selected)
      ? tree.nodes[selected]
      : tree.nodes[tree.roots[0]]
    : undefined;
  const lessons = useMemo(
    () => (active ? structureLessonIds(active, robot.id, robotLessons) : []),
    [active, robot.id],
  );
  useEffect(() => {
    if (!tree || !selected || !Object.hasOwn(tree.nodes, selected)) return;
    setExpanded(
      (old) => new Set([...old, ...structureAncestors(tree, selected)]),
    );
  }, [tree, selected]);
  const toggle = (id: string) =>
    setExpanded((old) => {
      const next = new Set(old);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const select = (id: string) => {
    onSelect(id);
  };
  const keyboard = (event: KeyboardEvent<HTMLDivElement>, id: string) => {
    if (!tree || event.target !== event.currentTarget) return;
    const node = tree.nodes[id],
      index = rows.findIndex((row) => row.node.id === id);
    let next: string | undefined;
    if (event.key === "ArrowDown")
      next = rows[Math.min(rows.length - 1, index + 1)]?.node.id;
    else if (event.key === "ArrowUp")
      next = rows[Math.max(0, index - 1)]?.node.id;
    else if (event.key === "Home") next = rows[0]?.node.id;
    else if (event.key === "End") next = rows.at(-1)?.node.id;
    else if (event.key === "ArrowRight") {
      if (
        node.children.length &&
        !expanded.has(id) &&
        !search?.expanded.has(id)
      )
        setExpanded((old) => new Set([...old, id]));
      else if (rows[index + 1]?.depth === rows[index].depth + 1)
        next = rows[index + 1].node.id;
    } else if (event.key === "ArrowLeft") {
      if (search?.query) next = node.parent || undefined;
      else if (expanded.has(id))
        setExpanded((old) => {
          const result = new Set(old);
          result.delete(id);
          return result;
        });
      else next = node.parent || undefined;
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      select(id);
      return;
    } else return;
    event.preventDefault();
    if (next) {
      select(next);
      rowRefs.current.get(next)?.focus();
    }
  };
  const restore = () => {
    setQuery("");
    if (tree) setExpanded(new Set(tree.roots));
    onRestore();
  };
  return (
    <section
      className="structure-navigator"
      data-testid="structure-navigator"
      aria-label={t("真实运动树", "Source kinematic tree")}
    >
      <div className="sn-heading">
        <div>
          <span>STRUCTURE NAVIGATOR</span>
          <h3>{t("沿真实连接，理解整机。", "Follow the real connections.")}</h3>
        </div>
        <Workflow size={21} />
      </div>
      <p className="sn-scope">
        {t(
          "按当前 URDF 的连杆与关节父子关系分组，不代表未公开的内部电路、外壳或维修分层。",
          "Grouped by the current URDF link–joint tree, not unpublished electronics, shell or service layers.",
        )}
      </p>
      {!tree ? (
        state.url === robot.urdfUrl && state.error ? (
          <div className="sn-error" role="alert">
            <p>
              {t(
                "无法读取有效源结构，未生成猜测的部件树。",
                "The source structure could not be read. No guessed tree was generated.",
              )}
            </p>
            <button onClick={() => setRetry((n) => n + 1)}>
              {t("重试结构读取", "Retry source tree")}
            </button>
          </div>
        ) : (
          <p role="status">
            {t("正在读取真实连接…", "Reading source connections…")}
          </p>
        )
      ) : (
        <>
          <div className="sn-stats">
            <span>
              <b data-testid="structure-link-count">{tree.linkCount}</b>
              {t("连杆/参考系", "links / frames")}
            </span>
            <span>
              <b data-testid="structure-visual-count">{tree.visualCount}</b>
              {t("visual 描述", "visual definitions")}
            </span>
            <span>
              <b data-testid="structure-visible-count">
                {visibleVisualCount(tree, Object.keys(tree.nodes), hidden)}
              </b>
              {t("按显隐状态可见", "visible by filter")}
            </span>
          </div>
          <label className="sn-search">
            <Search size={14} />
            <input
              aria-label={t(
                "搜索源部件或关节",
                "Search source links or joints",
              )}
              placeholder={t(
                "搜部件、关节或左腿…",
                "Find a link, joint or branch…",
              )}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button
                aria-label={t("清除结构搜索", "Clear structure search")}
                onClick={() => setQuery("")}
              >
                <X size={13} />
              </button>
            )}
          </label>
          <div className="sn-tree-tools">
            <button
              onClick={() => setExpanded(new Set(Object.keys(tree.nodes)))}
            >
              {t("展开全部", "Expand all")}
            </button>
            <button onClick={() => setExpanded(new Set(tree.roots))}>
              {t("收起分支", "Collapse branches")}
            </button>
            <button onClick={restore}>
              <RotateCcw size={12} />
              {t("恢复全机", "Restore whole model")}
            </button>
          </div>
          {search?.query && (
            <p className="sn-search-result" role="status">
              {t(
                `匹配 ${search.matched.size} 个源节点，保留上游路径。`,
                `${search.matched.size} source matches; ancestor paths retained.`,
              )}
            </p>
          )}
          <div
            className="sn-tree"
            role="tree"
            aria-label={t("URDF 连杆树", "URDF link tree")}
          >
            {rows.map(({ node, depth }) => {
              const open =
                  expanded.has(node.id) || !!search?.expanded.has(node.id),
                isActive = active?.id === node.id;
              const visible = visibleVisualCount(
                tree,
                node.descendantIds,
                hidden,
              );
              return (
                <div
                  key={node.id}
                  ref={(el) => {
                    if (el) rowRefs.current.set(node.id, el);
                    else rowRefs.current.delete(node.id);
                  }}
                  role="treeitem"
                  aria-level={depth + 1}
                  aria-selected={isActive}
                  aria-expanded={node.children.length ? open : undefined}
                  tabIndex={
                    (
                      rows.some((row) => row.node.id === active?.id)
                        ? isActive
                        : rows[0]?.node.id === node.id
                    )
                      ? 0
                      : -1
                  }
                  onKeyDown={(e) => keyboard(e, node.id)}
                  className={`sn-node ${isActive ? "active" : ""} ${search?.matched.has(node.id) ? "matched" : ""} ${node.visualCount === 0 ? "reference-only" : ""}`}
                  style={{ paddingLeft: 8 + Math.min(depth, 8) * 12 }}
                  data-source-link={node.id}
                  data-testid="structure-node"
                >
                  <button
                    className="sn-expand"
                    tabIndex={-1}
                    disabled={
                      !node.children.length ||
                      !!(search?.query && search.expanded.has(node.id))
                    }
                    aria-label={`${open ? t("收起", "Collapse") : t("展开", "Expand")} ${node.id}`}
                    onClick={() => toggle(node.id)}
                  >
                    {node.children.length ? (
                      open ? (
                        <ChevronDown size={12} />
                      ) : (
                        <ChevronRight size={12} />
                      )
                    ) : (
                      <span />
                    )}
                  </button>
                  <button
                    className="sn-node-select"
                    tabIndex={-1}
                    onClick={() => select(node.id)}
                    aria-label={`${t("选择源连杆", "Select source link")} ${node.id}`}
                  >
                    <Box size={12} />
                    <span>
                      <strong>{labels[node.id]}</strong>
                      <small>{node.id}</small>
                    </span>
                  </button>
                  <span
                    className="sn-count"
                    title={t(
                      "本分支可见 visual 描述数 / 总数",
                      "Visible / total visual definitions in this branch",
                    )}
                  >
                    {visible}/{node.visualCount}
                  </span>
                </div>
              );
            })}
            {!rows.length && (
              <p className="sn-no-results">
                {t("未找到匹配的源部件。", "No matching source links.")}
              </p>
            )}
          </div>
          {active && (
            <div className="sn-selection" data-testid="structure-selection">
              <div className="sn-path">
                {[...structureAncestors(tree, active.id), active.id].map(
                  (id, index) => (
                    <span key={id}>
                      {index > 0 && <ChevronRight size={10} />}
                      <button onClick={() => select(id)}>{labels[id]}</button>
                    </span>
                  ),
                )}
              </div>
              <h4>{labels[active.id]}</h4>
              <code data-testid="structure-selected-id">{active.id}</code>
              <p>
                {t(
                  `${active.descendantIds.length} 个源连杆/参考系 · ${active.visualCount} 个 visual 描述（含下游）`,
                  `${active.descendantIds.length} source links/frames · ${active.visualCount} visual definitions including descendants`,
                )}
              </p>
              {active.incomingJoint && (
                <p className="sn-joint">
                  <span>{t("上游连接", "Upstream joint")}</span>
                  <code>{active.incomingJoint.name}</code>
                  <b>{active.incomingJoint.type}</b>
                </p>
              )}
              {active.visualCount === 0 && (
                <p className="sn-reference-note">
                  {t(
                    "此源分支只有参考系，没有可显示的 visual 几何，不能据此推断实体器件外观。",
                    "This branch contains reference frames only, with no visual geometry. Its physical appearance cannot be inferred.",
                  )}
                </p>
              )}
              <div className="sn-branch-actions">
                <button
                  onClick={() =>
                    onBranch([...active.descendantIds], "highlight")
                  }
                  disabled={!active.visualCount}
                >
                  <Layers3 size={13} />
                  {t("高亮分支", "Highlight branch")}
                </button>
                <button
                  onClick={() => onBranch([...active.descendantIds], "isolate")}
                  disabled={!active.visualCount}
                >
                  <Eye size={13} />
                  {t("独显分支", "Isolate branch")}
                </button>
                <button
                  onClick={() => onBranch([...active.descendantIds], "focus")}
                  disabled={!active.visualCount}
                >
                  <Focus size={13} />
                  {t("聚焦分支", "Focus branch")}
                </button>
              </div>
              {!!onLesson && lessons.length > 0 && (
                <div className="sn-lessons">
                  <h5>{t("从这一分支继续学习", "Learn from this branch")}</h5>
                  {lessons.map((id) => {
                    const lesson = robotLessons.find((l) => l.id === id)!;
                    return (
                      <button key={id} onClick={() => onLesson(id)}>
                        <Workflow size={13} />
                        {lesson.title[lang]}
                        <ChevronRight size={12} />
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="sn-source">
                <a
                  href={siteAsset(robot.urdfUrl)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("核对本机原始 URDF", "Inspect local source URDF")}
                  <ArrowUpRight size={12} />
                </a>
                {robot.sourceCommit && (
                  <small>
                    {t("源版本", "Source revision")}:{" "}
                    {robot.sourceCommit.slice(0, 12)}
                  </small>
                )}
              </div>
              {onAssemble && (
                <button
                  className="sn-assemble"
                  onClick={() =>
                    onAssemble({
                      robotId: robot.id,
                      partId: active.id,
                      branchIds: [...active.descendantIds],
                      sourceCommit: robot.sourceCommit || null,
                    })
                  }
                >
                  <Wrench size={14} />
                  {t("带着当前观察进入装配", "Continue into assembly")}
                  <ArrowUpRight size={13} />
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
