import { Pressable, Text, View } from "react-native";

import type { TimeWindow } from "@/src/api";
import { fonts, makeStyles, spacing } from "@/src/theme";
import { DAY_ORDER, DayWindows, useDaySettings } from "./ScheduleEditor";

// day numbers (0=Mon..6=Sun) are unchanged in storage; only the on-screen order is Sunday first
const DAY_SHORT = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_NAME = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/**
 * When an alarm is active: which days it is on (tap a day to switch it off) and hours when it is paused.
 * In Shabbat mode there are no days, only hours.
 */
export function AlarmActivity({
  days,
  offWindows,
  onChange,
  testIDPrefix,
}: {
  days: number[];
  offWindows: TimeWindow[];
  onChange: (v: { days?: number[]; off_windows?: TimeWindow[] }) => void;
  testIDPrefix: string;
}) {
  const styles = useStyles();
  const perDay = useDaySettings();
  const allOff = perDay && days.length === 0;

  return (
    <View style={{ marginTop: spacing.md }}>
      {perDay && (
        <>
          <Text style={styles.title}>Days this alarm is on</Text>
          <View style={styles.daysRow}>
            {DAY_ORDER.map((d) => {
              const on = days.includes(d);
              return (
                <Pressable
                  key={d}
                  testID={`${testIDPrefix}-day-${d}`}
                  accessibilityLabel={DAY_NAME[d]}
                  onPress={() => onChange({ days: on ? days.filter((x) => x !== d) : [...days, d].sort() })}
                  style={[styles.day, on && styles.dayOn]}
                >
                  <Text style={[styles.dayText, on && styles.dayTextOn]}>{DAY_SHORT[d]}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.note}>
            {allOff ? "All days are off: this alarm stays inactive until you switch a day on." : "A day that is off keeps the alarm silent for the whole day."}
          </Text>
        </>
      )}
      <Text style={[styles.title, { marginTop: spacing.md }]}>Pause at certain hours</Text>
      <Text style={styles.note}>
        {perDay
          ? "Pick a day below, then add the hours the alarm should be paused that day. A day can have more than one pause window, and each day keeps its own."
          : "The alarm is off during these hours. Example: 10:00 to 12:00."}
      </Text>
      <DayWindows
        windows={offWindows}
        onChange={(off_windows) => onChange({ off_windows })}
        makeNew={(day) => ({ days: [day], start: "10:00", end: "12:00" })}
        testIDPrefix={`${testIDPrefix}-off`}
      />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  title: { fontFamily: fonts.text, fontSize: 15, fontWeight: "700", color: c.onSurface },
  note: { fontFamily: fonts.text, fontSize: 12, color: c.muted, marginTop: spacing.xs, marginBottom: spacing.xs },
  daysRow: { flexDirection: "row", gap: spacing.xs, marginTop: spacing.sm },
  day: { flex: 1, height: 40, borderRadius: 20, backgroundColor: c.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.divider },
  dayOn: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  dayText: { fontFamily: fonts.text, fontSize: 14, fontWeight: "700", color: c.muted },
  dayTextOn: { color: c.onBrandPrimary },
}));
