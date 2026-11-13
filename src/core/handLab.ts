import type { Localized, ModelInfo } from "../types";
export type HandJoint = {
  name: string;
  type: string;
  parent: string;
  child: string;
  lower: number;
  upper: number;
  mimic: boolean;
  mimicSource?: { joint: string; multiplier: number; offset: number };
};
export type HandDefinition = {
  robotId: string;
  revision: string;
  sourceUrl: string;
  license: string;
  palmLinks: string[];
  title?: Localized;
  description?: Localized;
  groupNote?: Localized;
  licenseNote?: Localized;
  sharedJoints?: string[];
  sourcePackageUrl?: string;
  fingers: {
    id: string;
    name: Localized;
    links: string[];
    joints: string[];
    curlFactors?: number[];
  }[];
  joints: HandJoint[];
};
export type HandPreset = "open" | "fist" | "pinch";
/** Fail closed when the loaded model differs from the audited source. */
export function validateHandModel(
  definition: HandDefinition,
  info: ModelInfo,
): string[] {
  const errors: string[] = [];
  const links = new Set(info.parts);
  const joints = new Map(info.joints.map((j) => [j.name, j]));
  for (const name of [
    ...definition.palmLinks,
    ...definition.fingers.flatMap((f) => f.links),
  ])
    if (!links.has(name)) errors.push(`link:${name}`);
  for (const source of definition.joints) {
    if (source.mimic) continue;
    const actual = joints.get(source.name);
    if (
      !actual ||
      actual.type !== source.type ||
      !Number.isFinite(actual.lower) ||
      !Number.isFinite(actual.upper) ||
      Math.abs(actual.lower - source.lower) > 1e-6 ||
      Math.abs(actual.upper - source.upper) > 1e-6
    )
      errors.push(`joint:${source.name}`);
  }
  return errors;
}
/** Source follower bounds are intersected with each independent drive, without changing the URDF. */
export function handDriveLimits(
  definition: HandDefinition,
  name: string,
): { lower: number; upper: number } {
  const root = definition.joints.find((j) => j.name === name);
  if (!root || root.mimic) return { lower: NaN, upper: NaN };
  let lower = root.lower,
    upper = root.upper;
  const relation = (
    joint: HandJoint,
    seen = new Set<string>(),
  ): { root: string; a: number; b: number } | null => {
    if (seen.has(joint.name)) return null;
    if (!joint.mimic) return { root: joint.name, a: 1, b: 0 };
    const m = joint.mimicSource;
    if (!m || !Number.isFinite(m.multiplier) || !Number.isFinite(m.offset))
      return null;
    const parent = definition.joints.find((j) => j.name === m.joint);
    if (!parent) return null;
    const next = new Set(seen);
    next.add(joint.name);
    const upstream = relation(parent, next);
    return upstream
      ? {
          root: upstream.root,
          a: upstream.a * m.multiplier,
          b: upstream.b * m.multiplier + m.offset,
        }
      : null;
  };
  for (const follower of definition.joints.filter((j) => j.mimic)) {
    const r = relation(follower);
    if (!r) return { lower: NaN, upper: NaN };
    if (r.root !== name) continue;
    if (r.a === 0) {
      if (r.b < follower.lower || r.b > follower.upper)
        return { lower: NaN, upper: NaN };
      continue;
    }
    const a = (follower.lower - r.b) / r.a,
      b = (follower.upper - r.b) / r.a;
    lower = Math.max(lower, Math.min(a, b));
    upper = Math.min(upper, Math.max(a, b));
  }
  return { lower, upper };
}
export function handFollowerPose(
  definition: HandDefinition,
  commands: Record<string, number>,
): Record<string, number> {
  const result = { ...commands };
  const resolve = (name: string, seen = new Set<string>()): number => {
    const joint = definition.joints.find((j) => j.name === name);
    if (!joint || seen.has(name)) return NaN;
    if (!joint.mimic)
      return Number.isFinite(commands[name]) ? commands[name] : 0;
    const m = joint.mimicSource;
    if (!m) return NaN;
    const next = new Set(seen);
    next.add(name);
    return resolve(m.joint, next) * m.multiplier + m.offset;
  };
  for (const joint of definition.joints)
    if (joint.mimic) result[joint.name] = resolve(joint.name);
  return result;
}
export function boundedHandPose(
  definition: HandDefinition,
  values: Record<string, number> = {},
): Record<string, number> {
  return Object.fromEntries(
    definition.joints
      .filter((j) => !j.mimic && j.type !== "fixed")
      .flatMap((j) => {
        const limits = handDriveLimits(definition, j.name);
        if (
          !Number.isFinite(limits.lower) ||
          !Number.isFinite(limits.upper) ||
          limits.lower > limits.upper
        )
          return [];
        return [
          [
            j.name,
            Math.max(
              limits.lower,
              Math.min(
                limits.upper,
                Number.isFinite(values[j.name]) ? values[j.name] : 0,
              ),
            ),
          ],
        ];
      }),
  );
}
/** App-authored joint-space poses, not source-provided grasp policies or collision checks. */
export function handPreset(
  definition: HandDefinition,
  preset: HandPreset,
): Record<string, number> {
  if (definition.robotId !== "leap_hand") {
    let pose = boundedHandPose(definition);
    definition.fingers.forEach((finger, index) => {
      const amount =
        preset === "open"
          ? 0
          : preset === "fist"
            ? 0.78
            : finger.id === "thumb" || index === 0
              ? 0.62
              : 0;
      pose = setHandFingerCurl(definition, finger.id, amount, pose);
    });
    return pose;
  }
  const values: Record<string, number> = {};
  // Each group is an audited palm-to-tip kinematic chain, not inferred from numeric IDs.
  for (const [index, finger] of definition.fingers.entries()) {
    const source = finger.joints.map((name) =>
      definition.joints.find((j) => j.name === name)!,
    );
    const factors =
      preset === "open"
        ? [0, 0, 0, 0]
        : preset === "fist"
          ? finger.id === "thumb"
            ? [0.34, 0.28, 0.36, 0.32]
            : [0.43, 0, 0.56, 0.5]
          : finger.id === "thumb"
            ? [0.44, 0.38, 0.35, 0.3]
            : index === 0
              ? [0.32, 0.1, 0.42, 0.34]
              : [0, 0, 0, 0];
    source.forEach((joint, i) => {
      if (joint && !joint.mimic)
        values[joint.name] = Math.max(0, joint.upper) * factors[i];
    });
  }
  return boundedHandPose(definition, values);
}
export function sampleHandPose(
  definition: HandDefinition,
  from: Record<string, number>,
  to: Record<string, number>,
  progress: number,
): Record<string, number> {
  const p = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  const eased = p * p * (3 - 2 * p);
  const a = boundedHandPose(definition, from),
    b = boundedHandPose(definition, to);
  return boundedHandPose(
    definition,
    Object.fromEntries(
      Object.keys(a).map((name) => [
        name,
        a[name] + (b[name] - a[name]) * eased,
      ]),
    ),
  );
}

export type HandSequence = "wave" | "opposition";
const curlFactors = (thumb: boolean) =>
  thumb ? [0.34, 0.28, 0.36, 0.32] : [0.43, 0, 0.56, 0.5];
const unit = (value: number) =>
  Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
/** Coordinate one audited chain only; other fingers retain their current source values. */
export function setHandFingerCurl(
  definition: HandDefinition,
  fingerId: string,
  amount: number,
  current: Record<string, number> = {},
): Record<string, number> {
  const values = boundedHandPose(definition, current);
  const finger = definition.fingers.find((f) => f.id === fingerId);
  if (!finger) return values;
  const factors = finger.curlFactors || curlFactors(finger.id === "thumb");
  finger.joints.forEach((name, index) => {
    const joint = definition.joints.find((j) => j.name === name);
    if (joint && !joint.mimic && joint.type !== "fixed")
      values[name] =
        Math.max(0, handDriveLimits(definition, joint.name).upper) *
        (factors[index] || 0) *
        unit(amount);
  });
  return boundedHandPose(definition, values);
}
/** The slider reflects the chain's primary coordinated axis; individual joint edits remain available. */
export function handFingerCurlLevel(
  definition: HandDefinition,
  fingerId: string,
  values: Record<string, number>,
): number {
  const finger = definition.fingers.find((f) => f.id === fingerId);
  const joint = definition.joints.find((j) => j.name === finger?.joints[0]);
  if (!finger || !joint) return 0;
  const span =
    Math.max(0, handDriveLimits(definition, joint.name).upper) *
    (finger.curlFactors || curlFactors(finger.id === "thumb"))[0];
  return span > 0 ? unit((values[joint.name] || 0) / span) : 0;
}
const pulse = (time: number, start: number, width: number) => {
  const local = (time - start) / width;
  return local <= 0 || local >= 1 ? 0 : Math.sin(Math.PI * local) ** 2;
};
/** Authored continuous joint-space coordination, never an IK/contact/grasp success claim. */
export function sampleHandSequence(
  definition: HandDefinition,
  sequence: HandSequence,
  progress: number,
  initial: Record<string, number> = {},
): Record<string, number> {
  const p = unit(progress);
  if (p === 1) return boundedHandPose(definition);
  if (p < 0.12) return sampleHandPose(definition, initial, {}, p / 0.12);
  const time = unit((p - 0.12) / 0.88);
  let values = boundedHandPose(definition);
  if (sequence === "wave") {
    definition.fingers.forEach((finger, index) => {
      const start = index * (0.54 / Math.max(1, definition.fingers.length - 1));
      values = setHandFingerCurl(
        definition,
        finger.id,
        pulse(time, start, 0.46),
        values,
      );
    });
  } else {
    const thumb = definition.fingers.find((f) => f.id === "thumb");
    const partners = definition.fingers.filter((f) => f.id !== "thumb");
    partners.forEach((finger, index) => {
      const amount = pulse(time, index / partners.length, 1 / partners.length);
      values = setHandFingerCurl(definition, finger.id, amount * 0.82, values);
      if (thumb && amount > 0) {
        values = setHandFingerCurl(definition, thumb.id, amount, values);
        // Distinct source-axis values for each pairing. These are not solved fingertip targets.
        thumb.joints.slice(0, 2).forEach((name, axis) => {
          const joint = definition.joints.find((j) => j.name === name);
          if (joint && !joint.mimic)
            values[name] =
              Math.max(0, handDriveLimits(definition, joint.name).upper) *
              (0.24 + index * 0.09 + axis * 0.06) *
              amount;
        });
      }
    });
  }
  return boundedHandPose(definition, values);
}
