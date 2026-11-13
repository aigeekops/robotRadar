import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import type { Lang } from "./types";
import {
  MusicIntent,
  readMusicPreference,
  saveMusicPreference,
  shouldStartMusicGesture,
} from "./core/musicPreference";
import "./styles/experiencePreferences.css";

/** Original, softly pulsed score. No recordings, copyrighted tracks or requests. */
export default function ExperiencePreferences({ lang }: { lang: Lang }) {
  const [enabled, setEnabled] = useState(() => {
    try {
      return readMusicPreference(localStorage);
    } catch {
      return true;
    }
  });
  const intent = useRef(new MusicIntent(enabled));
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const playingRef = useRef(false);
  const reportPlaying = (value: boolean) => {
    playingRef.current = value;
    setPlaying(value);
  };
  const [error, setError] = useState("");
  const audio = useRef<AudioContext | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = () => {
    intent.current.stop();
    setPaused(true);
    reportPlaying(false);
    if (audio.current?.state !== "closed")
      void audio.current?.suspend().catch(() => {});
  };
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      document.documentElement.dataset.reducedMotion = String(media.matches);
      window.dispatchEvent(new Event("robot-radar-motion-preference"));
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) stop();
    };
    const leave = () => stop();
    const gesture = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      const input = event as KeyboardEvent & PointerEvent;
      const onToggle = !!target?.closest('[data-testid="ambient-toggle"]');
      // Cancel only pending playback before a mute gesture can unlock it.
      // While playing, keep the SVG target stable until click handles mute.
      if (onToggle) {
        if (
          intent.current.enabled &&
          !playingRef.current &&
          ((event.type === "pointerdown" && input.button === 0) ||
            (event.type === "keydown" &&
              (input.key === "Enter" || input.key === " ")))
        )
          stop();
        return;
      }
      if (
        shouldStartMusicGesture({
          enabled: intent.current.enabled,
          playing: playingRef.current,
          visible: !document.hidden,
          trusted: event.isTrusted,
          onToggle,
          repeat: input.repeat,
          primary: event.type !== "pointerdown" || input.button === 0,
        })
      )
        void start();
    };
    document.addEventListener("pointerdown", gesture, true);
    document.addEventListener("keydown", gesture, true);
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", leave);
    window.addEventListener("blur", leave);
    if (intent.current.enabled && !document.hidden) void start();
    return () => {
      intent.current.stop();
      playingRef.current = false;
      document.removeEventListener("pointerdown", gesture, true);
      document.removeEventListener("keydown", gesture, true);
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("blur", leave);
      if (timer.current) clearInterval(timer.current);
      if (audio.current) audio.current.onstatechange = null;
      void audio.current?.close().catch(() => {});
      audio.current = null;
    };
  }, []);
  const start = async () => {
    const ticket = intent.current.start(!document.hidden);
    if (ticket === null) return;
    setPaused(false);
    setError("");
    try {
      if (!audio.current) {
        const context = new AudioContext();
        audio.current = context;
        context.onstatechange = () => {
          if (audio.current !== context) return;
          if (
            context.state === "running" &&
            (!intent.current.wantRunning ||
              !intent.current.enabled ||
              document.hidden)
          ) {
            reportPlaying(false);
            void context.suspend().catch(() => {});
            return;
          }
          reportPlaying(
            context.state === "running" &&
              intent.current.wantRunning &&
              intent.current.enabled &&
              !document.hidden,
          );
        };
        const gain = context.createGain();
        gain.gain.value = 0.18;
        const filter = context.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 1800;
        filter.connect(gain);
        gain.connect(context.destination);
        // Cmaj9 – Am9 – Fmaj9 – G6. Soft bass, warm pads and sparse eighth notes at 76 BPM.
        const chords = [
          [48, 55, 59, 62, 64],
          [45, 52, 55, 59, 60],
          [41, 48, 52, 55, 57],
          [43, 50, 55, 57, 59],
        ];
        const beat = 60 / 76;
        let step = 0;
        let next = context.currentTime + 0.08;
        const note = (
          midi: number,
          at: number,
          length: number,
          level: number,
          shape: OscillatorType = "sine",
        ) => {
          const osc = context.createOscillator();
          const envelope = context.createGain();
          osc.type = shape;
          osc.frequency.value = 440 * 2 ** ((midi - 69) / 12);
          envelope.gain.setValueAtTime(0, at);
          envelope.gain.linearRampToValueAtTime(
            level,
            at + Math.min(0.15, length / 5),
          );
          envelope.gain.exponentialRampToValueAtTime(0.0001, at + length);
          osc.connect(envelope);
          envelope.connect(filter);
          osc.start(at);
          osc.stop(at + length + 0.05);
          osc.onended = () => {
            osc.disconnect();
            envelope.disconnect();
          };
        };
        const schedule = () => {
          if (context.state !== "running") return;
          while (next < context.currentTime + 0.25) {
            const chord = chords[Math.floor(step / 16) % chords.length];
            const pulse = step % 16;
            if (pulse === 0) {
              note(chord[0] - 12, next, beat * 6, 0.13);
              chord.slice(1).forEach((n) => note(n, next, beat * 7, 0.035));
            }
            if ([0, 3, 6, 8, 11, 14].includes(pulse))
              note(
                chord[[2, 3, 1, 4, 3, 2][[0, 3, 6, 8, 11, 14].indexOf(pulse)]] +
                  12,
                next,
                beat * 1.7,
                0.075,
                "triangle",
              );
            next += beat / 2;
            step++;
          }
        };
        timer.current = setInterval(schedule, 100);
      }
      const context = audio.current;
      await context.resume();
      if (!intent.current.accepts(ticket, !document.hidden)) return;
      reportPlaying(context.state === "running");
    } catch (e) {
      if (!intent.current.accepts(ticket, !document.hidden)) return;
      // Autoplay denial is a waiting state, not playback or a fatal error.
      if (!(e instanceof DOMException && e.name === "NotAllowedError"))
        setError(e instanceof Error ? e.message : String(e));
      reportPlaying(false);
    }
  };
  const toggle = () => {
    const next = !intent.current.enabled;
    intent.current.setEnabled(next);
    setEnabled(next);
    setError("");
    try {
      saveMusicPreference(next, localStorage);
    } catch {
      /* Storage may be blocked. */
    }
    if (next) void start();
    else stop();
  };
  const label = enabled
    ? playing
      ? lang === "zh"
        ? "关闭背景音乐"
        : "Turn music off"
      : lang === "zh"
        ? "关闭背景音乐（等待播放）"
        : "Turn music off (waiting to play)"
    : lang === "zh"
      ? "开启背景音乐"
      : "Turn music on";
  return (
    <div className="experience-preferences">
      <button
        type="button"
        onClick={() => void toggle()}
        aria-pressed={enabled}
        data-enabled={String(enabled)}
        data-playback={
          enabled
            ? playing
              ? "playing"
              : paused
                ? "paused"
                : "pending"
            : "off"
        }
        data-audio-enabled={String(enabled)}
        data-audio-playing={String(playing)}
        data-audio-state={enabled ? (playing ? "playing" : "waiting") : "off"}
        aria-label={label}
        title={label}
        data-testid="ambient-toggle"
      >
        {playing ? <Volume2 size={19} /> : <VolumeX size={19} />}
      </button>
      {error && (
        <span className="audio-error" role="alert">
          {lang === "zh"
            ? "声音暂不可用；关闭再开启可重试"
            : "Audio unavailable. Turn off and on to retry."}
        </span>
      )}
    </div>
  );
}
