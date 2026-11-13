import { Box3, Vector3 } from "three";
/** Exact perspective fit of all eight bounds corners; limiting axis fills occupancy. */
export function fitAssemblyOverview(
  bounds: Box3,
  direction: Vector3,
  fovDegrees: number,
  aspect: number,
  occupancy = 0.82,
) {
  if (bounds.isEmpty() || aspect <= 0 || occupancy <= 0 || occupancy >= 1)
    throw Error("Invalid overview bounds");
  const center = bounds.getCenter(new Vector3()),
    back = direction.clone().normalize();
  const right = new Vector3(0, 1, 0).cross(back).normalize(),
    up = back.clone().cross(right).normalize();
  const tanV = Math.tan((fovDegrees * Math.PI) / 360),
    tanH = tanV * aspect;
  let distance = 0;
  for (const x of [bounds.min.x, bounds.max.x])
    for (const y of [bounds.min.y, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z]) {
        const p = new Vector3(x, y, z).sub(center),
          depth = p.dot(back);
        distance = Math.max(
          distance,
          depth + Math.abs(p.dot(right)) / (tanH * occupancy),
          depth + Math.abs(p.dot(up)) / (tanV * occupancy),
        );
      }
  return {
    center,
    distance,
    position: center.clone().addScaledVector(back, distance),
  };
}
