import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MusicIntent,
  MUSIC_PREFERENCE_KEY,
  parseMusicPreference,
  readMusicPreference,
  saveMusicPreference,
  shouldStartMusicGesture,
} from "../../src/core/musicPreference";
test("music defaults enabled, but a saved false always wins and unavailable storage stays usable", () => {
  assert.equal(parseMusicPreference(null), true);
  assert.equal(parseMusicPreference("false"), false);
  assert.equal(parseMusicPreference("true"), true);
  assert.equal(parseMusicPreference("broken"), true);
  assert.equal(
    readMusicPreference({
      getItem: () => {
        throw Error("denied");
      },
    }),
    true,
  );
  const values = new Map<string, string>();
  const store = {
    getItem: (k: string) => values.get(k) || null,
    setItem: (k: string, v: string) => {
      values.set(k, v);
    },
  };
  saveMusicPreference(false, store);
  assert.equal(values.get(MUSIC_PREFERENCE_KEY), "false");
  assert.equal(readMusicPreference(store), false);
  assert.doesNotThrow(() =>
    saveMusicPreference(false, {
      setItem: () => {
        throw Error("denied");
      },
    }),
  );
});
test("gesture retry supersedes pending autoplay; stale tickets cannot stop or report newer playback", () => {
  const intent = new MusicIntent(true),
    initial = intent.start(true)!,
    gesture = intent.start(true)!;
  assert.equal(intent.accepts(initial, true), false);
  assert.equal(intent.accepts(gesture, true), true);
  assert.equal(intent.wantRunning, true);
  intent.stop();
  assert.equal(intent.accepts(gesture, true), false);
  assert.equal(intent.wantRunning, false);
  assert.equal(intent.enabled, true);
  const resumed = intent.start(true)!;
  assert.equal(intent.accepts(resumed, true), true);
  intent.setEnabled(false);
  assert.equal(intent.accepts(resumed, true), false);
  assert.equal(intent.start(true), null);
  assert.equal(intent.wantRunning, false);
  intent.setEnabled(true);
  assert.equal(intent.start(false), null);
  assert.equal(intent.wantRunning, false);
});
test("only a real non-toggle primary gesture can resume enabled audio; close-button capture must never start it", () => {
  const input = {
    enabled: true,
    playing: false,
    visible: true,
    trusted: true,
    onToggle: false,
  };
  assert.equal(shouldStartMusicGesture(input), true);
  for (const patch of [
    { enabled: false },
    { playing: true },
    { visible: false },
    { trusted: false },
    { onToggle: true },
    { repeat: true },
    { primary: false },
  ])
    assert.equal(shouldStartMusicGesture({ ...input, ...patch }), false);
  const intent = new MusicIntent(true),
    autoplay = intent.start(true)!;
  intent.stop(); // mute pointerdown cancels before click persists false
  assert.equal(intent.accepts(autoplay, true), false);
  intent.setEnabled(false);
  assert.equal(intent.start(true), null);
});
