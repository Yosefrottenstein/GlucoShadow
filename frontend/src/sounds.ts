import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";

export type SoundId = "classic" | "chime" | "siren" | "pulse" | "gentle" | "alert";
export type AlertStyle = "sound" | "vibrate" | "both";
export type StyleWindow = { days: number[]; start: string; end: string; style: AlertStyle };
export type AlarmSound = { style: AlertStyle; sound: SoundId; repeat_minutes?: number; snooze_minutes?: number; windows?: StyleWindow[]; days?: number[]; off_windows?: { days: number[]; start: string; end: string }[] };

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
function inWindow(w: StyleWindow, now: Date) {
  const t = hhmm(now);
  const today = (now.getDay() + 6) % 7; // Monday = 0, same as the server
  if (w.start === w.end) return w.days.includes(today);
  if (w.start < w.end) return w.days.includes(today) && w.start <= t && t < w.end;
  return (w.days.includes(today) && t >= w.start) || (w.days.includes((today + 6) % 7) && t < w.end); // overnight window
}

/** The style to use right now: the first matching hours window, else the alarm's normal style. */
export function styleNow(cfg: { style: AlertStyle; windows?: StyleWindow[] }, now: Date = new Date()): AlertStyle {
  return cfg.windows?.find((w) => inWindow(w, now))?.style ?? cfg.style;
}

export const SOUNDS: { id: SoundId; label: string; file: number }[] = [
  { id: "classic", label: "Classic beep", file: require("../assets/sounds/classic.wav") },
  { id: "siren", label: "Siren", file: require("../assets/sounds/siren.wav") },
  { id: "alert", label: "Alert", file: require("../assets/sounds/alert.wav") },
  { id: "pulse", label: "Pulse", file: require("../assets/sounds/pulse.wav") },
  { id: "chime", label: "Chime", file: require("../assets/sounds/chime.wav") },
  { id: "gentle", label: "Gentle", file: require("../assets/sounds/gentle.wav") },
];

let player: AudioPlayer | null = null;
let modeSet = false;

export async function playSound(id: SoundId) {
  if (!modeSet) {
    modeSet = true;
    // Alarms must be heard even with the silent switch on.
    await setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }
  stopSound();
  const s = SOUNDS.find((x) => x.id === id) ?? SOUNDS[0];
  player = createAudioPlayer(s.file);
  player.play();
}

export function stopSound() {
  if (player) {
    player.pause();
    player.remove();
    player = null;
  }
}
