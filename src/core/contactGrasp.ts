export type GraspPhase =
  | "ready"
  | "grasping"
  | "grasped"
  | "lifting"
  | "holding"
  | "placing"
  | "complete"
  | "failed";
export interface GraspSnapshot {
  time: number;
  linkPositions: Record<string, number[]>;
  phase: GraspPhase;
  joints: Record<string, number>;
  lift: number;
  position: number[];
  quaternion: number[];
  speed: number;
  angularSpeed: number;
  contacts: {
    body: string;
    force: number[];
    normal: number;
    distance: number;
    position: number[];
  }[];
  support: boolean;
  holdSeconds: number;
  placeSeconds: number;
  earnedHold: boolean;
  hasGrasp: boolean;
  failure: string | null;
}
