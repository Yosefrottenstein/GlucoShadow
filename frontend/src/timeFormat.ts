// A personal display preference, like the language choice in i18n.ts: whether clock times show
// as 24-hour ("14:30") or 12-hour with AM/PM ("2:30 PM"). This never changes what's stored —
// every time is still kept and edited as a 24-hour "HH:mm" string everywhere in the app; this
// only changes how a few screens *display* a time to the person.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";
import { format } from "date-fns";

export type TimeFmt = "24h" | "12h";
const KEY = "time_format";

let fmt: TimeFmt = "24h";
let loaded = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export async function loadTimeFormat() {
  const v = (await AsyncStorage.getItem(KEY).catch(() => null)) as TimeFmt | null;
  if (v === "24h" || v === "12h") fmt = v;
  loaded = true;
  notify();
}

export function setTimeFormat(f: TimeFmt) {
  fmt = f;
  AsyncStorage.setItem(KEY, f).catch(() => {});
  notify();
}

export const getTimeFormat = () => fmt;
export const isTimeFormatLoaded = () => loaded;
export const useTimeFormat = () => useSyncExternalStore(subscribe, getTimeFormat);

/** Format a Date/ISO string as a short clock time, honouring the 12h/24h preference. */
export function fmtClock(d: Date | string, f: TimeFmt = fmt): string {
  return format(new Date(d), f === "12h" ? "h:mm a" : "HH:mm");
}
/** Same, with the weekday in front (e.g. "Mon 14:30" / "Mon 2:30 PM"). */
export function fmtClockDay(d: Date | string, f: TimeFmt = fmt): string {
  return format(new Date(d), f === "12h" ? "EEE h:mm a" : "EEE HH:mm");
}
/** Same, with the full date in front (e.g. "Mon, Jun 9 · 14:30"). */
export function fmtClockDate(d: Date | string, f: TimeFmt = fmt): string {
  return format(new Date(d), f === "12h" ? "EEE, MMM d · h:mm a" : "EEE, MMM d · HH:mm");
}

/** "HH:mm" (24h, as stored) -> a display string honouring the preference, without needing a Date. */
export function fmtStoredTime(hhmm: string, f: TimeFmt = fmt): string {
  if (f === "24h") return hhmm;
  const [hStr, m] = hhmm.split(":");
  const h = parseInt(hStr, 10);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${period}`;
}

/** Hook form: re-renders the component when the preference changes. */
export function useClock() {
  const f = useTimeFormat();
  return {
    fmt: f,
    fmtClock: (d: Date | string) => fmtClock(d, f),
    fmtClockDay: (d: Date | string) => fmtClockDay(d, f),
    fmtClockDate: (d: Date | string) => fmtClockDate(d, f),
    fmtStoredTime: (hhmm: string) => fmtStoredTime(hhmm, f),
  };
}
