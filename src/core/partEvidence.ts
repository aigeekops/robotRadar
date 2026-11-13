/** Bounded, non-executing XML subset reader for local URDF evidence. No DTD/entity expansion. */
type Node = { tag: string; attrs: Record<string, string>; children: Node[] };
export type Vector3 = [number, number, number];
export type JointEvidence = {
  mimic?: boolean;
  name: string;
  type: string;
  parent: string;
  child: string;
  axis: Vector3 | null;
  lower: number | null;
  upper: number | null;
  unit: "rad" | "m" | null;
};
export type LinkEvidence = {
  name: string;
  visualCount: number;
  collisionCount: number;
  massKg: number | null;
  centerOfMassM: Vector3 | null;
  upstream: JointEvidence[];
  downstream: JointEvidence[];
};
export type RobotEvidence = {
  links: Record<string, LinkEvidence>;
  joints: JointEvidence[];
};
function xml(text: string): Node {
  if (text.length > 2_000_000 || /<!DOCTYPE|<!ENTITY/i.test(text))
    throw Error("Unsupported XML");
  const clean = text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^\s*<\?xml[^?]*\?>/, "");
  const root: Node = {
    tag: "#document",
    attrs: Object.create(null),
    children: [],
  };
  const stack = [root];
  let end = 0,
    count = 0;
  const tokens = /<[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = tokens.exec(clean))) {
    const textNode = clean.slice(end, m.index);
    if ((stack.length === 1 && textNode.trim()) || /[<&]/.test(textNode))
      throw Error("Unexpected XML text");
    end = tokens.lastIndex;
    const token = m[0];
    if (token.startsWith("</")) {
      const name = token.slice(2, -1).trim();
      if (stack.length === 1 || stack.pop()!.tag !== name)
        throw Error("Mismatched XML");
      continue;
    }
    const tag = /^<([A-Za-z_][\w:.-]*)/.exec(token);
    if (!tag) throw Error("Invalid XML");
    const node: Node = {
      tag: tag[1],
      attrs: Object.create(null),
      children: [],
    };
    let rest = token.slice(tag[0].length, token.endsWith("/>") ? -2 : -1);
    while (rest.trim()) {
      const a = /^\s+([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/.exec(
        rest,
      );
      if (!a || Object.hasOwn(node.attrs, a[1]))
        throw Error("Invalid XML attribute");
      const raw = a[2] ?? a[3];
      if (/&(?!amp;|lt;|gt;|quot;|apos;)/.test(raw))
        throw Error("Unsupported entity");
      node.attrs[a[1]] = raw.replace(
        /&(amp|lt|gt|quot|apos);/g,
        (_, key: string) =>
          ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" })[key]!,
      );
      rest = rest.slice(a[0].length);
    }
    stack.at(-1)!.children.push(node);
    if (++count > 30000) throw Error("XML too complex");
    if (!token.endsWith("/>")) stack.push(node);
    if (stack.length > 64) throw Error("XML too deep");
  }
  if (
    clean.slice(end).trim() ||
    stack.length !== 1 ||
    root.children.length !== 1 ||
    root.children[0].tag !== "robot"
  )
    throw Error("Invalid robot XML");
  return root.children[0];
}
const child = (n: Node, tag: string) => n.children.find((c) => c.tag === tag);
function number(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function vector(value: string | undefined): Vector3 | null {
  if (!value) return null;
  const parts = value.trim().split(/\s+/).map(number);
  return parts.length === 3 && parts.every((n) => n !== null)
    ? (parts as Vector3)
    : null;
}
export function parsePartEvidence(text: string): RobotEvidence {
  const root = xml(text);
  const links: Record<string, LinkEvidence> = Object.create(null);
  const joints: JointEvidence[] = [];
  for (const n of root.children.filter((n) => n.tag === "link")) {
    const name = n.attrs.name;
    if (!name || Object.hasOwn(links, name)) throw Error("Invalid link name");
    const inertial = child(n, "inertial");
    const mass = inertial ? number(child(inertial, "mass")?.attrs.value) : null;
    links[name] = {
      name,
      visualCount: n.children.filter((c) => c.tag === "visual").length,
      collisionCount: n.children.filter((c) => c.tag === "collision").length,
      massKg: mass !== null && mass >= 0 ? mass : null,
      centerOfMassM: inertial
        ? vector(child(inertial, "origin")?.attrs.xyz)
        : null,
      upstream: [],
      downstream: [],
    };
  }
  const names = new Set<string>();
  for (const n of root.children.filter((n) => n.tag === "joint")) {
    const name = n.attrs.name,
      type = n.attrs.type;
    const parent = child(n, "parent")?.attrs.link,
      target = child(n, "child")?.attrs.link;
    if (
      !name ||
      names.has(name) ||
      !type ||
      !parent ||
      !target ||
      !Object.hasOwn(links, parent) ||
      !Object.hasOwn(links, target) ||
      parent === target
    )
      throw Error("Invalid joint topology");
    names.add(name);
    const limit = child(n, "limit");
    const j: JointEvidence = {
      ...(child(n, "mimic") ? { mimic: true } : {}),
      name,
      type,
      parent,
      child: target,
      axis: vector(child(n, "axis")?.attrs.xyz),
      lower: number(limit?.attrs.lower),
      upper: number(limit?.attrs.upper),
      unit:
        type === "revolute" || type === "continuous"
          ? "rad"
          : type === "prismatic"
            ? "m"
            : null,
    };
    joints.push(j);
    links[parent].downstream.push(j);
    links[target].upstream.push(j);
  }
  if (!Object.keys(links).length || Object.keys(links).length > 2000)
    throw Error("Invalid link count");
  const visiting = new Set<string>(),
    done = new Set<string>();
  function visit(name: string) {
    if (visiting.has(name)) throw Error("Cyclic topology");
    if (done.has(name)) return;
    visiting.add(name);
    if (links[name].upstream.length > 1) throw Error("Multiple parents");
    for (const j of links[name].downstream) visit(j.child);
    visiting.delete(name);
    done.add(name);
  }
  Object.keys(links).forEach(visit);
  return { links, joints };
}
