/** Joint utilities operate in SI units, never infer physical limits. */
export interface JointLimits {
  lower: number;
  upper: number;
}
export type JointKind = "fixed" | "revolute" | "continuous" | "prismatic";
export function radiansToDegrees(value: number): number {
  return (value * 180) / Math.PI;
}
export function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}
export function clampJoint(
  value: number,
  kind: JointKind,
  limits?: JointLimits,
): number {
  if (!Number.isFinite(value))
    throw new RangeError("Joint value must be finite");
  if (kind === "fixed") return 0;
  if (kind === "continuous") return value;
  if (
    !limits ||
    !Number.isFinite(limits.lower) ||
    !Number.isFinite(limits.upper) ||
    limits.lower > limits.upper
  ) {
    throw new RangeError("Bounded joints require valid, source-backed limits");
  }
  return Math.max(limits.lower, Math.min(limits.upper, value));
}
