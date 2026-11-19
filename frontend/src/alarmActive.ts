import { format, isSameDay } from "date-fns";

import type { TimeWindow } from "@/src/api";
import { getTimeFormat } from "@/src/timeFormat";

export type Schedule = { days?: number[]; off_windows?: TimeWindow[] };

const ALL = [0, 1, 2, 3, 4, 5, 6];
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

function inWindow(w: TimeWindow, now: Date) {
  const t = hhmm(now);
  const today = (now.getDay() + 6) % 7; // Monday = 0, same as the server
  if (w.start === w.end) return w.days.includes(today);
  if (w.start < w.end) return w.days.includes(today) && w.start <= t && t < w.end;
  return (w.days.includes(today) && t >= w.start) || (w.days.includes((today + 6) % 7) && t < w.end); // overnight
}

/** True when the alarm is switched off at this moment: an off day, or inside a pause window. Same rule as the server. */
export function pausedAt(cfg: Schedule | undefined, at: Date): boolean {
  if (!cfg) return false;
  if (!(cfg.days ?? ALL).includes((at.getDay() + 6) % 7)) return true;
  return (cfg.off_windows ?? []).some((w) => inWindow(w, at));
}

export type AlarmState = { active: boolean; text: string };

const NEVER = "This alarm is inactive until you change the settings.";

/** Live state of an alarm: active now, or inactive and until when (looks up to 8 days ahead). */
export function alarmState(cfg: Schedule | undefined, enabled: boolean, now: Date = new Date()): AlarmState {
  if (!enabled) return { active: false, text: NEVER };
  if (!pausedAt(cfg, now)) return { active: true, text: "" };
  const t0 = new Date(now);
  t0.setSeconds(0, 0);
  for (let i = 1; i <= 8 * 1440; i++) {
    const t = new Date(t0.getTime() + i * 60000);
    if (!pausedAt(cfg, t)) {
      const clock = getTimeFormat() === "12h" ? "h:mm a" : "HH:mm";
      return { active: false, text: `This alarm is inactive until ${isSameDay(t, now) ? format(t, clock) : format(t, `EEE ${clock}`)}.` };
    }
  }
  return { active: false, text: NEVER };
}
