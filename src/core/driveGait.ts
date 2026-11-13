/** Presentation trajectory, not a contact/balance controller. Units match the source URDF. */
export const GAIT_STRIDE = 0.72;
export const GAIT_STANCE = 0.6;
export function footTrajectory(
  travel: number,
  side: "left" | "right",
  blend: number,
) {
  const p =
    (((travel / GAIT_STRIDE + 0.3 + (side === "right" ? 0.5 : 0)) % 1) + 1) % 1;
  const amount = Math.max(0, Math.min(1, Number.isFinite(blend) ? blend : 0));
  const half = (GAIT_STRIDE * GAIT_STANCE) / 2;
  if (p < GAIT_STANCE)
    return {
      phase: p,
      stance: true,
      forward: (half - p * GAIT_STRIDE) * amount,
      lift: 0,
    };
  const u = (p - GAIT_STANCE) / (1 - GAIT_STANCE),
    smooth = u * u * (3 - 2 * u);
  return {
    phase: p,
    stance: false,
    forward: (-half + 2 * half * smooth) * amount,
    lift: Math.sin(Math.PI * u) * 0.065 * amount,
  };
}
export function finiteDampedStep(
  jacobian: number[][],
  error: number[],
  damping = 0.025,
): number[] {
  if (
    jacobian.length !== 3 ||
    jacobian.some((row) => row.length !== 3) ||
    error.length !== 3 ||
    [...jacobian.flat(), ...error, damping].some((v) => !Number.isFinite(v))
  )
    return [0, 0, 0];
  // Solve (J J^T + lambda² I) y = error, then dq = J^T y. Small bounded Gaussian elimination.
  const a = Array.from({ length: 3 }, (_, r) => [
    ...Array.from(
      { length: 3 },
      (_, c) =>
        jacobian[r].reduce((sum, v, k) => sum + v * jacobian[c][k], 0) +
        (r === c ? damping * damping : 0),
    ),
    error[r],
  ]);
  for (let c = 0; c < 3; c++) {
    let pivot = c;
    for (let r = c + 1; r < 3; r++)
      if (Math.abs(a[r][c]) > Math.abs(a[pivot][c])) pivot = r;
    if (Math.abs(a[pivot][c]) < 1e-10) return [0, 0, 0];
    [a[c], a[pivot]] = [a[pivot], a[c]];
    const div = a[c][c];
    for (let k = c; k < 4; k++) a[c][k] /= div;
    for (let r = 0; r < 3; r++)
      if (r !== c) {
        const f = a[r][c];
        for (let k = c; k < 4; k++) a[r][k] -= f * a[c][k];
      }
  }
  return [0, 1, 2].map((c) =>
    Math.max(
      -0.12,
      Math.min(
        0.12,
        jacobian.reduce((sum, row, r) => sum + row[c] * a[r][3], 0),
      ),
    ),
  );
}
