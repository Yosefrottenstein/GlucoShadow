import Ionicons from "@react-native-vector-icons/ionicons";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import type { ChannelSchedule, TimeWindow } from "@/src/api";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { useTimeFormat } from "@/src/timeFormat";
import { ChipRow } from "./ChipRow";

/** false in Shabbat mode: it is one day, so hours are set but days are not. */
export const DaySettingsContext = createContext(true);
export const useDaySettings = () => useContext(DaySettingsContext);

// day numbers (0=Mon..6=Sun) are unchanged in storage; only the on-screen order is Sunday first
const DAY_SHORT = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_NAME = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const DAY_ORDER = [6, 0, 1, 2, 3, 4, 5]; // Sun, Mon, Tue, Wed, Thu, Fri, Sat
const ALL = [0, 1, 2, 3, 4, 5, 6];
const PRESETS: { label: string; days: number[] }[] = [
  { label: "Every day", days: ALL },
  { label: "Weekdays", days: [0, 1, 2, 3, 4] },
  { label: "Weekend", days: [5, 6] },
];

const toMin = (t: string) => parseInt(t.slice(0, 2), 10) * 60 + parseInt(t.slice(3), 10);
const fromMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
// Each window is inside one day: "from" is always earlier than "to" (07:00 to 12:00, never 14:00 to 07:00).
const withStart = <T extends { start: string; end: string }>(w: T, t: string): T => {
  if (toMin(t) < toMin(w.end)) return { ...w, start: t };
  const start = Math.min(toMin(t), 1438);
  return { ...w, start: fromMin(start), end: fromMin(Math.min(1439, start + 60)) };
};
const withEnd = <T extends { start: string; end: string }>(w: T, t: string): T => {
  if (toMin(t) > toMin(w.start)) return { ...w, end: t };
  const end = Math.max(toMin(t), 1);
  return { ...w, end: fromMin(end), start: fromMin(Math.max(0, end - 60)) };
};

// Formats typed digits as HH:MM
export const asTime = (text: string) => {
  const d = text.replace(/\D/g, "").slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d;
};

export const validTime = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

const sameDays = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export const describeDays = (days: number[]) => {
  const preset = PRESETS.find((p) => sameDays(p.days, days));
  if (preset) return preset.label === "Every day" ? "" : `${preset.label} `;
  return `${days.map((d) => DAY_NAME[d].slice(0, 3)).join(", ")} `;
};

export const describeWindow = (w: TimeWindow) => `${describeDays(w.days)}${w.start}–${w.end}`;

export const describeSchedule = (s: ChannelSchedule) => {
  if (s.mode !== "hours" || !s.windows.length) return "any time";
  return s.windows.length === 1 ? describeWindow(s.windows[0]) : `${describeWindow(s.windows[0])} +${s.windows.length - 1} more`;
};

export function ScheduleEditor({
  value,
  onChange,
  testIDPrefix,
}: {
  value: ChannelSchedule;
  onChange: (v: ChannelSchedule) => void;
  testIDPrefix: string;
}) {
  const options = [
    { value: "always" as const, label: "Any time" },
    { value: "hours" as const, label: "Only at set hours" },
  ];
  const pick = (mode: ChannelSchedule["mode"]) => onChange({ ...value, mode });
  const is12h = useTimeFormat() === "12h";

  return (
    <View>
      <ChipRow options={options} value={value.mode === "hours" ? "hours" : "always"} onChange={pick} testIDPrefix={testIDPrefix} padded={false} />
      {value.mode === "hours" && (
        <DayWindows
          windows={value.windows}
          onChange={(windows) => onChange({ ...value, windows })}
          makeNew={(day) => ({ days: [day], start: "13:00", end: "15:00" })}
          hint={
            is12h
              ? "Type the hour and minutes, then tap AM/PM. Uses your phone's time zone. A window like 10:00 PM–07:00 AM runs overnight into the next day."
              : "Type the hour (00–23) and minutes (00–59) with 2 digits each. Uses your phone's time zone. A window like 22:00–07:00 runs overnight into the next day."
          }
          testIDPrefix={testIDPrefix}
        />
      )}
    </View>
  );
}

/**
 * Every day of the week keeps its own, fully independent list of time windows: pick a day, and
 * only that day's windows show up below. A day can have more than one window (e.g. 07:00–10:00
 * and again 12:00–14:00) — they're just separate entries, nothing merges them. Editing or
 * removing a window here never touches another day: if an older window still spans several days
 * (from before this screen worked this way), the moment you touch it here it's split, so the
 * other days it covered keep their original hours untouched.
 *
 * A day with no windows at all simply isn't covered by anything here — for "only at set hours"
 * schedules that means this day never matches; for "pause" and "different style" hours it means
 * this day is never paused / never overridden, i.e. the normal behaviour, all day.
 */
export function DayWindows<T extends TimeWindow>({
  windows,
  onChange,
  makeNew,
  renderExtra,
  hint,
  testIDPrefix,
}: {
  windows: T[];
  onChange: (next: T[]) => void;
  /** Builds a brand-new window for the given day. */
  makeNew: (day: number) => T;
  /** Extra per-window controls (e.g. a style picker), rendered under the time row. */
  renderExtra?: (w: T, set: (patch: Partial<T>) => void) => ReactNode;
  hint?: string;
  testIDPrefix: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const perDay = useDaySettings();

  if (!perDay) {
    // Shabbat mode: there is no day of the week to pick, just one flat list of hours.
    return <FlatWindows windows={windows} onChange={onChange} makeNew={() => makeNew(0)} renderExtra={renderExtra} hint={hint} testIDPrefix={testIDPrefix} />;
  }

  const today = (new Date().getDay() + 6) % 7;
  const [day, setDay] = useState(today);
  const mine = windows.filter((w) => w.days.includes(day));

  const touch = (w: T, patch: Partial<T> | null) => {
    if (w.days.length > 1) {
      // This window is still shared with other days: peel this one day off it (keeping the other
      // days exactly as they were) before applying the change, so nothing else is affected.
      const rest: T = { ...w, days: w.days.filter((d) => d !== day) };
      const mineNow: T | null = patch ? { ...w, ...patch, days: [day] } : null;
      onChange(windows.flatMap((x) => (x === w ? [rest, ...(mineNow ? [mineNow] : [])] : [x])));
    } else {
      onChange(patch ? windows.map((x) => (x === w ? { ...x, ...patch } : x)) : windows.filter((x) => x !== w));
    }
  };

  return (
    <View>
      <View style={styles.daysRow} testID={`${testIDPrefix}-days`}>
        {DAY_ORDER.map((d) => {
          const has = windows.some((w) => w.days.includes(d));
          return (
            <Pressable
              key={d}
              testID={`${testIDPrefix}-pick-day-${d}`}
              accessibilityLabel={DAY_NAME[d]}
              onPress={() => setDay(d)}
              style={[styles.day, has && styles.dayHas, day === d && styles.dayPicked]}
            >
              <Text style={[styles.dayText, (has || day === d) && styles.dayTextOn]}>{DAY_SHORT[d]}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.note}>
        {mine.length ? `${DAY_NAME[day]}'s own hours, below.` : `${DAY_NAME[day]} has none set yet — add one below.`} Filled-in days above already have
        hours; tap any day to see or change just that day's.
      </Text>
      {mine.map((w, i) => (
        <View key={i} style={styles.window} testID={`${testIDPrefix}-day-${day}-window-${i}`}>
          <View style={styles.windowRow}>
            <TimeRow value={w} onChange={(patch) => touch(w, patch)} testID={`${testIDPrefix}-day-${day}-window-${i}`} />
            <Pressable
              testID={`${testIDPrefix}-day-${day}-window-${i}-remove`}
              onPress={() => touch(w, null)}
              hitSlop={8}
              style={styles.remove}
              accessibilityLabel="Remove this window"
            >
              <Ionicons name="trash-outline" size={20} color={colors.muted} />
            </Pressable>
          </View>
          {renderExtra?.(w, (patch) => touch(w, patch))}
        </View>
      ))}
      {mine.length < 6 && (
        <Pressable testID={`${testIDPrefix}-day-${day}-add`} onPress={() => onChange([...windows, makeNew(day)])} style={styles.add}>
          <Ionicons name="add-circle" size={18} color={colors.brandPrimary} />
          <Text style={styles.addText}>{mine.length ? `Add another window for ${DAY_NAME[day]}` : `Add hours for ${DAY_NAME[day]}`}</Text>
        </Pressable>
      )}
      {hint && <Text style={styles.note}>{hint}</Text>}
    </View>
  );
}

/** Shabbat mode (and any other no-day-picker case): just a flat, addable list of windows. */
function FlatWindows<T extends TimeWindow>({
  windows,
  onChange,
  makeNew,
  renderExtra,
  hint,
  testIDPrefix,
}: {
  windows: T[];
  onChange: (next: T[]) => void;
  makeNew: () => T;
  renderExtra?: (w: T, set: (patch: Partial<T>) => void) => ReactNode;
  hint?: string;
  testIDPrefix: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const setAt = (i: number, patch: Partial<T>) => onChange(windows.map((w, j) => (j === i ? { ...w, ...patch } : w)));
  const removeAt = (i: number) => onChange(windows.filter((_, j) => j !== i));
  return (
    <View>
      {windows.map((w, i) => (
        <View key={i} style={styles.window} testID={`${testIDPrefix}-window-${i}`}>
          <View style={styles.windowRow}>
            <TimeRow value={w} onChange={(patch) => setAt(i, patch)} testID={`${testIDPrefix}-window-${i}`} />
            <Pressable
              testID={`${testIDPrefix}-window-${i}-remove`}
              onPress={() => removeAt(i)}
              hitSlop={8}
              style={styles.remove}
              accessibilityLabel="Remove this window"
            >
              <Ionicons name="trash-outline" size={20} color={colors.muted} />
            </Pressable>
          </View>
          {renderExtra?.(w, (patch) => setAt(i, patch))}
        </View>
      ))}
      {windows.length < 6 && (
        <Pressable testID={`${testIDPrefix}-add`} onPress={() => onChange([...windows, makeNew()])} style={styles.add}>
          <Ionicons name="add-circle" size={18} color={colors.brandPrimary} />
          <Text style={styles.addText}>Add {windows.length ? "another window" : "hours"}</Text>
        </Pressable>
      )}
      {hint && <Text style={styles.note}>{hint}</Text>}
    </View>
  );
}

function TimeRow<T extends { start: string; end: string }>({ value, onChange, testID }: { value: T; onChange: (patch: Partial<T>) => void; testID: string }) {
  const styles = useStyles();
  return (
    <View style={styles.timesRow}>
      <Text style={styles.label}>From</Text>
      <TimeInput value={value.start} onChange={(t) => onChange(withStart(value, t))} testID={`${testID}-start`} />
      <Text style={styles.label}>to</Text>
      <TimeInput value={value.end} onChange={(t) => onChange(withEnd(value, t))} testID={`${testID}-end`} />
    </View>
  );
}

/** Typed time. Always stored and sent around as 24h "HH:mm"; shown as either 24h (00-23) or
 * 12h with an AM/PM toggle, depending on the person's Time format setting (Settings > Appearance). */
function TimeInput({ value, onChange, testID }: { value: string; onChange: (t: string) => void; testID: string }) {
  const styles = useStyles();
  const is12h = useTimeFormat() === "12h";
  const [h0, m0] = value.split(":");
  const h24of = (hh: string) => parseInt(hh || "0", 10);
  const disp12 = (H: number) => String(H % 12 === 0 ? 12 : H % 12);
  const [h, setH] = useState(is12h ? disp12(h24of(h0)) : h0);
  const [m, setM] = useState(m0);
  const [pm, setPm] = useState(h24of(h0) >= 12);
  const [focus, setFocus] = useState<null | "h" | "m">(null);
  const minuteRef = useRef<TextInput>(null);
  useEffect(() => {
    const H = h24of(h0);
    setH(is12h ? disp12(H) : h0);
    setM(m0);
    setPm(H >= 12);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [h0, m0, is12h]);

  // Fix up what was typed (pad to 2 digits, cap at range) and tell the parent, always in 24h.
  const commit = (pmNow = pm) => {
    const M = String(Math.min(59, parseInt(m || "0", 10))).padStart(2, "0");
    let H: number;
    if (is12h) {
      const h12 = Math.min(12, Math.max(1, parseInt(h || "12", 10)));
      H = pmNow ? (h12 === 12 ? 12 : h12 + 12) : h12 === 12 ? 0 : h12;
    } else {
      H = Math.min(23, parseInt(h || "0", 10));
    }
    const Hstr = String(H).padStart(2, "0");
    setH(is12h ? disp12(H) : Hstr);
    setM(M);
    setPm(H >= 12);
    if (`${Hstr}:${M}` !== value) onChange(`${Hstr}:${M}`);
  };

  return (
    <View style={styles.timeBox}>
      <TextInput
        testID={`${testID}-hour`}
        accessibilityLabel={is12h ? "Hour, 1 or 2 digits" : "Hour, 2 digits"}
        value={h}
        onChangeText={(t) => {
          const d = t.replace(/\D/g, "").slice(0, 2);
          setH(d);
          if (d.length === 2) minuteRef.current?.focus();
        }}
        onFocus={() => setFocus("h")}
        onBlur={() => {
          setFocus(null);
          commit();
        }}
        keyboardType="number-pad"
        maxLength={2}
        selectTextOnFocus
        placeholder={is12h ? "H" : "HH"}
        style={[styles.timeInput, focus === "h" && styles.timeInputOn]}
      />
      <Text style={styles.colon}>:</Text>
      <TextInput
        ref={minuteRef}
        testID={`${testID}-minute`}
        accessibilityLabel="Minutes, 2 digits"
        value={m}
        onChangeText={(t) => setM(t.replace(/\D/g, "").slice(0, 2))}
        onFocus={() => setFocus("m")}
        onBlur={() => {
          setFocus(null);
          commit();
        }}
        keyboardType="number-pad"
        maxLength={2}
        selectTextOnFocus
        placeholder="MM"
        style={[styles.timeInput, focus === "m" && styles.timeInputOn]}
      />
      {is12h && (
        <Pressable
          testID={`${testID}-ampm`}
          accessibilityLabel={pm ? "PM, tap to switch to AM" : "AM, tap to switch to PM"}
          onPress={() => commit(!pm)}
          style={styles.ampm}
        >
          <Text style={styles.ampmText}>{pm ? "PM" : "AM"}</Text>
        </Pressable>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  window: { backgroundColor: c.surface, borderRadius: radius.md, padding: spacing.sm, marginTop: spacing.sm },
  windowRow: { flexDirection: "row", alignItems: "center" },
  daysRow: { flexDirection: "row", justifyContent: "space-between", gap: 4, marginTop: spacing.sm },
  day: { flex: 1, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceSecondary, borderWidth: 1.5, borderColor: c.surfaceSecondary },
  dayHas: { backgroundColor: c.brandSecondary, borderColor: c.brandSecondary },
  dayPicked: { borderColor: c.brandPrimary },
  dayText: { fontFamily: fonts.text, fontSize: 14, fontWeight: "700", color: c.onSurfaceTertiary },
  dayTextOn: { color: c.onBrandSecondary },
  timesRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm, flex: 1 },
  label: { fontFamily: fonts.text, fontSize: 14, color: c.onSurfaceTertiary },
  timeBox: { flexDirection: "row", alignItems: "center", gap: 4 },
  timeInput: {
    width: 46,
    height: 44,
    padding: 0,
    borderRadius: radius.sm,
    textAlign: "center",
    backgroundColor: c.surfaceSecondary,
    borderWidth: 1.5,
    borderColor: c.surfaceSecondary,
    fontFamily: fonts.display,
    fontSize: 17,
    fontWeight: "700",
    color: c.onSurface,
  },
  timeInputOn: { borderColor: c.brandPrimary },
  colon: { fontFamily: fonts.display, fontSize: 17, fontWeight: "700", color: c.muted },
  ampm: { height: 44, paddingHorizontal: spacing.xs, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceSecondary, marginLeft: 2 },
  ampmText: { fontFamily: fonts.text, fontSize: 12, fontWeight: "700", color: c.onSurfaceTertiary },
  remove: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  add: { flexDirection: "row", alignItems: "center", gap: spacing.xs, minHeight: 44, marginTop: spacing.xs },
  addText: { fontFamily: fonts.text, fontSize: 14, fontWeight: "700", color: c.brandPrimary },
  note: { fontFamily: fonts.text, fontSize: 12, color: c.muted, marginVertical: spacing.sm },
}));
