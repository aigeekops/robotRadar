export type Lang = "zh" | "en";
export type Localized = { zh: string; en: string };
export type RobotEntry = {
  id: string;
  name: Localized;
  manufacturer: string;
  form: string;
  description: Localized;
  urdfUrl: string;
  sourceUrl: string;
  license: string;
  sourceCommit?: string;
  provenanceUrl?: string;
  noticeUrl?: string;
  sourceDownloadUrl?: string;
  verifiedScope: Localized;
  limitations: Localized;
};
export type JointInfo = {
  name: string;
  type: string;
  lower: number;
  upper: number;
  value: number;
};
export type ModelInfo = { parts: string[]; joints: JointInfo[] };
