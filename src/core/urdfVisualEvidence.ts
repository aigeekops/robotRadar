import { Matrix4, Euler, Quaternion, Vector3 } from "three";
import { parsePartEvidence } from "./partEvidence";
import {
  groupVisualInstances,
  type VisualPartInstance,
  type SourceVisualEvidence,
} from "./visualGrouping";

// Same bounded non-executing XML subset as partEvidence; no network or entities.
type Node = { tag: string; attrs: Record<string, string>; children: Node[] };
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
const children = (n: Node, tag: string) =>
  n.children.filter((c) => c.tag === tag);
function numbers(value: string | undefined, fallback: number[]): number[] {
  if (value === undefined) return fallback;
  const result = value.trim().split(/\s+/).map(Number);
  if (
    result.length !== fallback.length ||
    result.some((n) => !Number.isFinite(n))
  )
    throw Error("Invalid visual numeric attribute");
  return result;
}
function canonical(n: Node): string {
  return JSON.stringify([
    n.tag,
    Object.entries(n.attrs).sort(([a], [b]) => a.localeCompare(b)),
    n.children.map(canonical),
  ]);
}
function origin(n: Node): number[] {
  const os = children(n, "origin");
  if (os.length > 1) throw Error("Duplicate visual origin");
  if (
    os[0] &&
    Object.keys(os[0].attrs).some((k) => !["xyz", "rpy"].includes(k))
  )
    throw Error("Unsupported origin attributes");
  const xyz = numbers(os[0]?.attrs.xyz, [0, 0, 0]),
    rpy = numbers(os[0]?.attrs.rpy, [0, 0, 0]);
  // URDF fixed-axis RPY = Rz(yaw) Ry(pitch) Rx(roll).
  return new Matrix4()
    .compose(
      new Vector3(...xyz),
      new Quaternion().setFromEuler(new Euler(rpy[0], rpy[1], rpy[2], "ZYX")),
      new Vector3(1, 1, 1),
    )
    .toArray();
}
function side(name: string): VisualPartInstance["handedness"] {
  const s = name.toLowerCase();
  const left =
    /(^|[_\W])(left|l|fl|rl|lf|lh)(?=[_\W]|$)/.test(s) ||
    /(^|_)left/.test(s) ||
    s.includes("左");
  const right =
    /(^|[_\W])(right|r|fr|rr|rf|rh)(?=[_\W]|$)/.test(s) ||
    /(^|_)right/.test(s) ||
    s.includes("右");
  return left && right
    ? "unknown"
    : left
      ? "left"
      : right
        ? "right"
        : "neutral";
}
export type UrdfVisualSource = {
  robotId: string;
  sourceCommit: string;
  urdfUri: string;
};
export type UrdfVisualAdaptation = {
  instances: VisualPartInstance[];
  exclusions: { instanceId: string; reason: string }[];
  groups: ReturnType<typeof groupVisualInstances>;
};
/** Display-source equivalence only. Never infer physical specification or interchangeability. */
export function adaptUrdfVisuals(
  text: string,
  source: UrdfVisualSource,
): UrdfVisualAdaptation {
  if (
    !source.robotId.trim() ||
    !source.urdfUri.trim() ||
    !/^[0-9a-f]{40,64}$/i.test(source.sourceCommit)
  )
    throw Error("Pinned source revision required");
  parsePartEvidence(text); // shared source topology/name validation
  const root = xml(text),
    materials = new Map<string, Node[]>();
  for (const m of children(root, "material")) {
    const name = m.attrs.name;
    if (name) materials.set(name, [...(materials.get(name) || []), m]);
  }
  const instances: VisualPartInstance[] = [],
    exclusions: UrdfVisualAdaptation["exclusions"] = [];
  for (const link of children(root, "link")) {
    const instanceId = link.attrs.name;
    let reason = "";
    const visuals: SourceVisualEvidence[] = [];
    try {
      for (const v of children(link, "visual")) {
        if (
          v.children.some(
            (n) => !["origin", "geometry", "material"].includes(n.tag),
          )
        )
          throw Error("Unsupported visual extension");
        const gs = children(v, "geometry");
        if (
          gs.length !== 1 ||
          gs[0].children.length !== 1 ||
          gs[0].children[0].tag !== "mesh"
        )
          throw Error("Non-mesh or ambiguous geometry remains singleton");
        const mesh = gs[0].children[0];
        if (!mesh.attrs.filename?.trim()) throw Error("Missing mesh URI");
        if (
          Object.keys(mesh.attrs).some(
            (k) => !["filename", "scale"].includes(k),
          )
        )
          throw Error("Unsupported mesh attributes");
        const scale = numbers(mesh.attrs.scale, [1, 1, 1]);
        if (scale.some((n) => n === 0)) throw Error("Degenerate mesh scale");
        const resolved = children(v, "material").map((m) => {
          if (m.children.length) return m;
          const defs = materials.get(m.attrs.name) || [];
          if (defs.length !== 1 || !defs[0].children.length)
            throw Error("Unresolved named material");
          return defs[0];
        });
        // Complete declared material set is encoded, not just first material or display name.
        // Absent override is deterministic for the SAME pinned mesh URI: embedded material/default.
        const identity = JSON.stringify(
          resolved.length
            ? resolved.map(canonical)
            : ["same-source-mesh-embedded-or-loader-default"],
        );
        const colors = resolved.flatMap((m) => children(m, "color"));
        for (const c of colors) {
          const rgba = numbers(c.attrs.rgba, [NaN, NaN, NaN, NaN]);
          if (
            rgba.length !== 4 ||
            rgba.some((x) => !Number.isFinite(x) || x < 0 || x > 1)
          )
            throw Error("Invalid material color");
        }
        visuals.push({
          meshUri: mesh.attrs.filename,
          scale,
          localMatrix: origin(v),
          material: { identity, rgba: [1, 1, 1, 1], textureUri: null },
        });
      }
    } catch (e) {
      reason = e instanceof Error ? e.message : "Unknown source visual";
      visuals.length = 0;
    }
    if (!visuals.length && !reason) reason = "No visual geometry";
    const instance: VisualPartInstance = {
      instanceId,
      linkName: instanceId,
      sourceScope: JSON.stringify(source),
      identityBasis: "source-visuals",
      specificationKey: null,
      handedness: side(instanceId),
      visuals,
    };
    instances.push(instance);
    if (reason) exclusions.push({ instanceId, reason });
  }
  return { instances, exclusions, groups: groupVisualInstances(instances) };
}
