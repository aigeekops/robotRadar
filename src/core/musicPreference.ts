export const MUSIC_PREFERENCE_KEY = "robot-radar:music-enabled:v1";
/** First visit opts in; only an explicitly saved boolean changes that default. */
export function parseMusicPreference(raw: string | null): boolean {
  return raw === "false" ? false : true;
}
export function readMusicPreference(
  storage?: Pick<Storage, "getItem">,
): boolean {
  try {
    return parseMusicPreference(storage?.getItem(MUSIC_PREFERENCE_KEY) ?? null);
  } catch {
    return true;
  }
}
export function saveMusicPreference(
  enabled: boolean,
  storage?: Pick<Storage, "setItem">,
): void {
  try {
    storage?.setItem(MUSIC_PREFERENCE_KEY, String(enabled));
  } catch {
    /* Session preference remains effective. */
  }
}
/** Gesture retries may supersede pending autoplay promises; stale completions never change intent. */
export class MusicIntent {
  enabled: boolean;
  wantRunning = false;
  private generation = 0;
  constructor(enabled: boolean) {
    this.enabled = enabled;
  }
  start(visible: boolean): number | null {
    if (!this.enabled || !visible) return null;
    this.wantRunning = true;
    return ++this.generation;
  }
  stop(): void {
    this.wantRunning = false;
    this.generation++;
  }
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.stop();
  }
  accepts(ticket: number, visible: boolean): boolean {
    return (
      ticket === this.generation && this.enabled && this.wantRunning && visible
    );
  }
}
export function shouldStartMusicGesture(input: {
  enabled: boolean;
  playing: boolean;
  visible: boolean;
  trusted: boolean;
  onToggle: boolean;
  repeat?: boolean;
  primary?: boolean;
}): boolean {
  return (
    input.enabled &&
    !input.playing &&
    input.visible &&
    input.trusted &&
    !input.onToggle &&
    !input.repeat &&
    input.primary !== false
  );
}
