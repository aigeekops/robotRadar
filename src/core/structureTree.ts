import type {
  RobotEvidence,
  LinkEvidence,
  JointEvidence,
} from "./partEvidence";

/** Source kinematic hierarchy only. These nodes are not invented functional/electronics layers. */
export type StructureNode = {
  id: string;
  parent: string | null;
  children: string[];
  incomingJoint: JointEvidence | null;
  link: LinkEvidence;
  descendantIds: string[];
  visualCount: number;
};
export type StructureTree = {
  roots: string[];
  nodes: Record<string, StructureNode>;
  linkCount: number;
  visualCount: number;
};
export type StructureSearch = {
  query: string;
  matched: Set<string>;
  visible: Set<string>;
  expanded: Set<string>;
};
export function buildStructureTree(evidence: RobotEvidence): StructureTree {
  const nodes: Record<string, StructureNode> = Object.create(null);
  const ids = Object.keys(evidence.links);
  if (!ids.length || ids.length > 2000) throw Error("Invalid source tree size");
  for (const id of ids) {
    const link = evidence.links[id];
    if (!Number.isInteger(link.visualCount) || link.visualCount < 0)
      throw Error("Invalid source visual count");
    nodes[id] = {
      id,
      parent: null,
      children: [],
      incomingJoint: null,
      link,
      descendantIds: [],
      visualCount: 0,
    };
  }
  for (const joint of evidence.joints) {
    if (
      !Object.hasOwn(nodes, joint.parent) ||
      !Object.hasOwn(nodes, joint.child) ||
      joint.parent === joint.child
    )
      throw Error("Unknown or self-linked source node");
    if (nodes[joint.child].parent !== null)
      throw Error("Multiple source parents");
    nodes[joint.parent].children.push(joint.child);
    nodes[joint.child].parent = joint.parent;
    nodes[joint.child].incomingJoint = joint;
  }
  const roots = ids.filter((id) => nodes[id].parent === null);
  const visiting = new Set<string>(),
    done = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) throw Error("Cyclic source topology");
    if (done.has(id)) return;
    visiting.add(id);
    const node = nodes[id];
    node.descendantIds = [id];
    node.visualCount = node.link.visualCount;
    for (const child of node.children) {
      visit(child);
      node.descendantIds.push(...nodes[child].descendantIds);
      node.visualCount += nodes[child].visualCount;
    }
    visiting.delete(id);
    done.add(id);
  };
  ids.forEach(visit);
  return {
    roots,
    nodes,
    linkCount: ids.length,
    visualCount: roots.reduce((sum, id) => sum + nodes[id].visualCount, 0),
  };
}
export function structureAncestors(tree: StructureTree, id: string): string[] {
  if (!Object.hasOwn(tree.nodes, id)) return [];
  const ancestors: string[] = [];
  let node = tree.nodes[id];
  while (node.parent !== null) {
    ancestors.unshift(node.parent);
    node = tree.nodes[node.parent];
  }
  return ancestors;
}
export function visibleVisualCount(
  tree: StructureTree,
  ids: readonly string[],
  hidden: readonly string[],
): number {
  const hiddenSet = new Set(hidden),
    unique = new Set(ids);
  return [...unique].reduce(
    (sum, id) =>
      sum +
      (Object.hasOwn(tree.nodes, id) && !hiddenSet.has(id)
        ? tree.nodes[id].link.visualCount
        : 0),
    0,
  );
}
const normalize = (value: string) =>
  value.normalize("NFKC").trim().toLocaleLowerCase();
export function searchStructureTree(
  tree: StructureTree,
  query: string,
  labels: Record<string, string> = {},
): StructureSearch {
  const normalized = normalize(query),
    matched = new Set<string>(),
    visible = new Set<string>(),
    expanded = new Set<string>();
  if (!normalized) return { query: "", matched, visible, expanded };
  const terms = normalized.split(/\s+/);
  for (const node of Object.values(tree.nodes)) {
    const haystack = normalize(
      [
        node.id,
        node.incomingJoint?.name,
        node.incomingJoint?.type,
        Object.hasOwn(labels, node.id) ? labels[node.id] : "",
      ]
        .filter(Boolean)
        .join(" "),
    );
    if (terms.every((term) => haystack.includes(term))) {
      matched.add(node.id);
      visible.add(node.id);
      for (const ancestor of structureAncestors(tree, node.id)) {
        visible.add(ancestor);
        expanded.add(ancestor);
      }
    }
  }
  return { query: normalized, matched, visible, expanded };
}
export function structureRows(
  tree: StructureTree,
  expanded: ReadonlySet<string>,
  search?: StructureSearch,
): { node: StructureNode; depth: number }[] {
  const rows: { node: StructureNode; depth: number }[] = [];
  const walk = (id: string, depth: number) => {
    if (search?.query && !search.visible.has(id)) return;
    const node = tree.nodes[id];
    rows.push({ node, depth });
    if (expanded.has(id) || search?.expanded.has(id))
      node.children.forEach((child) => walk(child, depth + 1));
  };
  tree.roots.forEach((id) => walk(id, 0));
  return rows;
}
export function structureLessonIds(
  node: StructureNode,
  robotId: string,
  lessons: readonly {
    id: string;
    robotId: string;
    partIds: readonly string[];
  }[],
): string[] {
  const links = new Set(node.descendantIds);
  return lessons
    .filter(
      (lesson) =>
        lesson.robotId === robotId &&
        lesson.partIds.some((id) => links.has(id)),
    )
    .map((lesson) => lesson.id);
}
/** Helpful translations of the actual source identifiers, never inferred internal systems. */
export function structureLabel(id: string, lang: "zh" | "en"): string {
  const en = id.replace(/_link$/, "").replaceAll("_", " ");
  if (lang === "en") return en;
  const unitree: Record<string, string> = {
    pelvis: "骨盆",
    torso_link: "躯干",
    head_link: "头部",
    logo_link: "标识面板",
    base: "基座",
    base_link: "基座",
    base_footprint: "地面参考系",
    left_hip_pitch_link: "左腿 · 髋俯仰",
    right_hip_pitch_link: "右腿 · 髋俯仰",
    left_shoulder_pitch_link: "左臂 · 肩俯仰",
    right_shoulder_pitch_link: "右臂 · 肩俯仰",
    FL_hip: "左前腿 · 髋部",
    FR_hip: "右前腿 · 髋部",
    RL_hip: "左后腿 · 髋部",
    RR_hip: "右后腿 · 髋部",
  };
  if (Object.hasOwn(unitree, id)) return unitree[id];
  return id
    .replace(/^left_/, "左侧 · ")
    .replace(/^right_/, "右侧 · ")
    .replace(/^FL_/, "左前 · ")
    .replace(/^FR_/, "右前 · ")
    .replace(/^RL_/, "左后 · ")
    .replace(/^RR_/, "右后 · ")
    .replace("hip_roll", "髋侧摆")
    .replace("hip_yaw", "髋偏航")
    .replace("hip_pitch", "髋俯仰")
    .replace("shoulder_roll", "肩侧摆")
    .replace("shoulder_yaw", "肩偏航")
    .replace("shoulder_pitch", "肩俯仰")
    .replace("ankle_pitch", "踝俯仰")
    .replace("ankle_roll", "踝侧摆")
    .replace("knee", "膝部")
    .replace("elbow", "肘部")
    .replace("wrist_roll_rubber_hand", "腕与手形外观")
    .replace("thigh", "大腿")
    .replace("calf", "小腿")
    .replace("foot", "足端")
    .replace("imu_in_torso", "躯干 IMU 参考系")
    .replace("imu_in_pelvis", "骨盆 IMU 参考系")
    .replace(/_link$/, "连杆")
    .replaceAll("_", " ");
}
