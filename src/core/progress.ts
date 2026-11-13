export interface Progress {
  schemaVersion: 1;
  robotId: string;
  contentVersion: string;
  completedLessons: string[];
  completedSteps: string[];
  answers: Record<string, number>;
  updatedAt: string;
}
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
const prefix = "robot-radar:progress:";
export function progressKey(robotId: string, contentVersion: string): string {
  return `${prefix}${encodeURIComponent(robotId)}:${encodeURIComponent(contentVersion)}`;
}
export function emptyProgress(
  robotId: string,
  contentVersion: string,
): Progress {
  return {
    schemaVersion: 1,
    robotId,
    contentVersion,
    completedLessons: [],
    completedSteps: [],
    answers: {},
    updatedAt: new Date().toISOString(),
  };
}
function stringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === "string") &&
    new Set(value).size === value.length
  );
}
export function restoreProgress(
  raw: string | null,
  robotId: string,
  contentVersion: string,
): Progress {
  const empty = () => emptyProgress(robotId, contentVersion);
  if (!raw || raw.length > 1_000_000) return empty();
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return empty();
    const p = value as Partial<Progress>;
    if (
      p.schemaVersion !== 1 ||
      p.robotId !== robotId ||
      p.contentVersion !== contentVersion ||
      !stringArray(p.completedLessons) ||
      !stringArray(p.completedSteps) ||
      !p.answers ||
      typeof p.answers !== "object" ||
      Array.isArray(p.answers) ||
      typeof p.updatedAt !== "string" ||
      !Number.isFinite(Date.parse(p.updatedAt))
    )
      return empty();
    const answers: Record<string, number> = Object.create(null);
    for (const [id, answer] of Object.entries(p.answers)) {
      if (
        ["__proto__", "prototype", "constructor"].includes(id) ||
        typeof answer !== "number" ||
        !Number.isInteger(answer) ||
        answer < 0
      )
        return empty();
      answers[id] = answer;
    }
    return {
      schemaVersion: 1,
      robotId,
      contentVersion,
      completedLessons: [...p.completedLessons],
      completedSteps: [...p.completedSteps],
      answers,
      updatedAt: p.updatedAt,
    };
  } catch {
    return empty();
  }
}
export function loadProgress(
  storage: StorageLike,
  robotId: string,
  contentVersion: string,
): Progress {
  try {
    return restoreProgress(
      storage.getItem(progressKey(robotId, contentVersion)),
      robotId,
      contentVersion,
    );
  } catch {
    return emptyProgress(robotId, contentVersion);
  }
}
export function saveProgress(
  storage: StorageLike,
  progress: Progress,
): boolean {
  try {
    storage.setItem(
      progressKey(progress.robotId, progress.contentVersion),
      JSON.stringify({ ...progress, updatedAt: new Date().toISOString() }),
    );
    return true;
  } catch {
    return false;
  }
}
export function clearProgress(
  storage: StorageLike,
  robotId: string,
  contentVersion: string,
): boolean {
  try {
    storage.removeItem(progressKey(robotId, contentVersion));
    return true;
  } catch {
    return false;
  }
}
