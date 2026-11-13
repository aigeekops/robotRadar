/** An overview cell for every real source step, never an inferred physical part. */
export function assemblyTrayLayout(
  footprints: readonly { width: number; depth: number }[],
  radius: number,
) {
  if (
    !Number.isFinite(radius) ||
    radius <= 0 ||
    footprints.some(
      (p) =>
        !Number.isFinite(p.width) ||
        !Number.isFinite(p.depth) ||
        p.width < 0 ||
        p.depth < 0,
    )
  )
    throw Error("Invalid source tray bounds");
  const cellX =
    Math.max(radius * 0.38, ...footprints.map((p) => p.width)) + radius * 0.16;
  const cellZ =
    Math.max(radius * 0.38, ...footprints.map((p) => p.depth)) + radius * 0.16;
  const rows = Math.ceil(footprints.length / 4);
  const cells = footprints.map((_, index) => {
    const column = index % 4,
      row = Math.floor(index / 4),
      side = column < 2 ? -1 : 1;
    return {
      index,
      x:
        side *
        (radius * 0.8 + cellX * (column < 2 ? 1.5 - column : column - 1.5)),
      z: ((rows - 1) / 2 - row) * cellZ,
    };
  });
  return { cellX, cellZ, rows, cells };
}
