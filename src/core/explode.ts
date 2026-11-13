import * as THREE from "three";
/** Expand visual meshes in world space, then convert targets back to their parent's coordinates. */
export function applyExplode(
  root: THREE.Object3D,
  originals: Map<THREE.Object3D, THREE.Vector3>,
  center: THREE.Vector3,
  distance: number,
) {
  // Restore the entire graph before measuring any point: no order-dependent accumulation.
  originals.forEach((position, node) => node.position.copy(position));
  root.updateMatrixWorld(true);
  const moves: { node: THREE.Object3D; target: THREE.Vector3 }[] = [];
  const groups = new Map<THREE.Object3D, THREE.Object3D[]>();
  originals.forEach((_, node) => {
    // A transformed visual ancestor already moves its descendants.
    let parent = node.parent;
    while (parent && parent !== root) {
      if (originals.has(parent)) return;
      parent = parent.parent;
    }
    let group = node.parent || root;
    while (
      group.parent &&
      group !== root &&
      !(group as THREE.Object3D & { isURDFLink?: boolean }).isURDFLink
    )
      group = group.parent;
    groups.set(group, [...(groups.get(group) || []), node]);
  });
  if (!Number.isFinite(distance) || distance <= 0) return;
  const g1 =
    !!root.getObjectByName("left_shoulder_pitch_link") &&
    !!root.getObjectByName("pelvis");
  const go2 =
    !!root.getObjectByName("FL_hip") && !!root.getObjectByName("RR_calf");
  const worldRotation = root.getWorldQuaternion(new THREE.Quaternion());
  groups.forEach((nodes, group) => {
    const bounds = new THREE.Box3();
    nodes.forEach((node) => bounds.union(new THREE.Box3().setFromObject(node)));
    const direction = bounds.isEmpty()
      ? new THREE.Vector3()
      : bounds.getCenter(new THREE.Vector3()).sub(center);
    direction.normalize().multiplyScalar(distance);
    // Source-identified chains get separated lanes and axial stages. No geometry or joint rotation is changed.
    const name = group.name;
    if (g1) {
      const side = name.startsWith("left_")
        ? 1
        : name.startsWith("right_")
          ? -1
          : 0;
      const armStages = [
        "shoulder_pitch",
        "shoulder_roll",
        "shoulder_yaw",
        "elbow",
        "wrist",
      ];
      const legStages = [
        "hip_pitch",
        "hip_roll",
        "hip_yaw",
        "knee",
        "ankle_pitch",
        "ankle_roll",
      ];
      const arm = armStages.findIndex((part) => name.includes(part));
      const leg = legStages.findIndex((part) => name.includes(part));
      if (side && arm >= 0)
        direction
          .set(side * 0.65, side * (1.15 + arm * 0.48), 0.65 - arm * 0.15)
          .multiplyScalar(distance)
          .applyQuaternion(worldRotation);
      else if (side && leg >= 0)
        direction
          .set(side * 0.45, side * 0.75, -0.5 - leg * 0.55)
          .multiplyScalar(distance)
          .applyQuaternion(worldRotation);
      else if (/head|mid360|d435/.test(name))
        direction
          .set(name.includes("d435") ? 0.6 : 0, 0, 1.4)
          .multiplyScalar(distance)
          .applyQuaternion(worldRotation);
      else if (/torso|logo/.test(name))
        direction
          .set(0, 0, 0.55)
          .multiplyScalar(distance)
          .applyQuaternion(worldRotation);
      else direction.set(0, 0, 0);
    } else if (go2) {
      const branch = /^(F|R)(L|R)_/.exec(name);
      if (branch) {
        const depth = name.includes("foot")
          ? 3
          : name.includes("calf")
            ? 2
            : name.includes("thigh")
              ? 1
              : 0;
        const side = branch[2] === "L" ? 1 : -1;
        direction
          .set(
            (branch[1] === "F" ? 1 : -1) * (1 + depth * 0.2),
            side * (1 + (name.includes("rotor") ? 0.55 : 0)),
            -depth * 0.8,
          )
          .multiplyScalar(distance)
          .applyQuaternion(worldRotation);
      } else if (/Head|camera|radar/.test(name))
        direction
          .set(1, 0, name.includes("upper") ? 0.9 : 0.3)
          .multiplyScalar(distance)
          .applyQuaternion(worldRotation);
      else direction.set(0, 0, 0);
    }
    nodes.forEach((node) =>
      moves.push({
        node,
        target: node.getWorldPosition(new THREE.Vector3()).add(direction),
      }),
    );
  });
  moves.forEach(({ node, target }) =>
    node.position.copy(node.parent ? node.parent.worldToLocal(target) : target),
  );
  root.updateMatrixWorld(true);
}
