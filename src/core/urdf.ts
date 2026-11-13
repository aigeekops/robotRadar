/** urdf-loader 0.12 uses type/mimicJoint; later versions may add a boolean flag. */
export function isMimicJoint(joint: {
  type?: string;
  mimicJoint?: unknown;
  isURDFMimicJoint?: boolean;
}): boolean {
  return (
    joint.type === "URDFMimicJoint" ||
    joint.isURDFMimicJoint === true ||
    typeof joint.mimicJoint === "string"
  );
}
