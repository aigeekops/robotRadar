/** Conservative display deduplication, never a bill of interchangeable real parts. */
export type VisualMaterialEvidence = {
  /** Resolved name plus exact color/texture/shading evidence; absent material is unknown. */
  identity: string;
  rgba: readonly number[];
  textureUri: string | null;
};
export type SourceVisualEvidence = {
  meshUri: string;
  scale: readonly number[];
  /** Column-major visual-to-link matrix, not world pose. */
  localMatrix: readonly number[];
  material: VisualMaterialEvidence | null;
};
export type VisualPartInstance = {
  instanceId: string;
  linkName: string;
  /** Exact asset/model revision scope. No cross-model or cross-revision grouping. */
  sourceScope: string;
  /** Verified same specification family. Unknown => singleton, not name guessing. */
  specificationKey: string | null;
  /** Source-visual-only mode does not claim a physical specification. */
  identityBasis?: "verified-specification" | "source-visuals";
  /** Explicit source evidence; unknown handedness is deliberately a singleton. */
  handedness: "left" | "right" | "neutral" | "unknown";
  visuals: readonly SourceVisualEvidence[];
  /** Preserve original assembly instance placement; it does not affect display grouping. */
  sourceWorldMatrix?: readonly number[];
};
export type VisualDisplayGroup = {
  id: string;
  representative: VisualPartInstance;
  instances: readonly VisualPartInstance[];
  quantity: number;
  basis: "exact-source-visuals" | "unverified-singleton";
  /** Full canonical evidence key, deliberately not a collision-prone short hash. */
  evidenceKey: string | null;
};
const finite = (v: readonly number[], length: number) =>
  v.length === length && v.every(Number.isFinite);
const nonempty = (s: string | null | undefined): s is string =>
  typeof s === "string" && s.trim().length > 0;
/** Keep lateral/position name tokens even if an upstream adapter mistakenly marks neutral. */
function nameVariant(name: string): string[] {
  const tokens = name
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/^([LR])(?=[A-Z][a-z])/, "$1_")
    .toLowerCase()
    .split(/[^a-z0-9]+/);
  return [
    ...(name.match(/[左右前后上下]|镜像/g) || []),
    ...(name.toLowerCase().match(/(?:^|_)(left|right)(?=[a-z])/g) || []).map(
      (x) => x.replace(/^_/, ""),
    ),
    ...tokens
      .map((s) =>
        /^(fl|rl|lf|lh)$/.test(s)
          ? "left"
          : /^(fr|rr|rf|rh)$/.test(s)
            ? "right"
            : s,
      )
      .filter((s) =>
        /^(left|right|l|r|fl|fr|rl|rr|lf|rf|lh|rh|front|rear|back|upper|lower|mirror|mirrored|lhs|rhs)$/.test(
          s,
        ),
      ),
  ];
}
export function visualEvidenceKey(part: VisualPartInstance): string | null {
  if (
    !nonempty(part.sourceScope) ||
    (part.identityBasis !== "source-visuals" &&
      !nonempty(part.specificationKey)) ||
    !["left", "right", "neutral"].includes(part.handedness) ||
    !part.visuals.length
  )
    return null;
  const visuals: string[] = [];
  for (const v of part.visuals) {
    const m = v.material;
    if (
      !nonempty(v.meshUri) ||
      !finite(v.scale, 3) ||
      v.scale.some((s) => s === 0) ||
      !finite(v.localMatrix, 16) ||
      !m ||
      !nonempty(m.identity) ||
      !finite(m.rgba, 4) ||
      m.rgba.some((s) => s < 0 || s > 1) ||
      (m.textureUri !== null && !nonempty(m.textureUri))
    )
      return null;
    // No URI normalization, tolerances, mirrored transforms, or appearance heuristics.
    visuals.push(
      JSON.stringify([
        v.meshUri,
        v.scale,
        v.localMatrix,
        m.identity,
        m.rgba,
        m.textureUri,
      ]),
    );
  }
  // Visual declaration order is irrelevant; duplicate visuals remain significant.
  return JSON.stringify([
    part.sourceScope,
    part.identityBasis || "verified-specification",
    part.specificationKey,
    part.handedness,
    nameVariant(part.linkName),
    visuals.sort(),
  ]);
}
export function groupVisualInstances(
  parts: readonly VisualPartInstance[],
): VisualDisplayGroup[] {
  const ids = new Set<string>(),
    groups: VisualDisplayGroup[] = [],
    byKey = new Map<string, VisualDisplayGroup>();
  for (const input of parts) {
    if (
      !nonempty(input.instanceId) ||
      !nonempty(input.linkName) ||
      ids.has(input.instanceId)
    )
      throw Error("Every source instance requires a unique ID and link name");
    ids.add(input.instanceId);
    // Copy evidence so later caller edits cannot silently mutate recorded assembly instances.
    const part: VisualPartInstance = {
      ...input,
      sourceWorldMatrix: input.sourceWorldMatrix
        ? [...input.sourceWorldMatrix]
        : undefined,
      visuals: input.visuals.map((v) => ({
        ...v,
        scale: [...v.scale],
        localMatrix: [...v.localMatrix],
        material: v.material
          ? { ...v.material, rgba: [...v.material.rgba] }
          : null,
      })),
    };
    const key = visualEvidenceKey(part),
      existing = key === null ? undefined : byKey.get(key);
    if (existing) {
      existing.instances = [...existing.instances, part];
      existing.quantity++;
    } else {
      const group: VisualDisplayGroup = {
        id: `visual-group:${part.instanceId}`,
        representative: part,
        instances: [part],
        quantity: 1,
        basis: key === null ? "unverified-singleton" : "exact-source-visuals",
        evidenceKey: key,
      };
      groups.push(group);
      if (key !== null) byKey.set(key, group);
    }
  }
  return groups;
}
