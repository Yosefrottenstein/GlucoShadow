import { Text, View } from "react-native";

import type { AlertStyle, StyleWindow } from "@/src/sounds";
import { fonts, makeStyles, spacing } from "@/src/theme";
import { ChipRow } from "./ChipRow";
import { DayWindows } from "./ScheduleEditor";

/** Hours when this alarm should use a different style, e.g. vibrate only at night and ring during the day. */
export function StyleHours({ value, onChange, testIDPrefix }: { value: StyleWindow[]; onChange: (v: StyleWindow[]) => void; testIDPrefix: string }) {
  const styles = useStyles();
  return (
    <View style={{ marginTop: spacing.md }}>
      <Text style={styles.title}>Different at certain hours</Text>
      <Text style={styles.note}>
        At these hours this alarm uses the style you pick here instead of its normal one. Pick a day below, then add as many windows as that day
        needs — e.g. vibrate only 00:00–07:00 and again 13:00–14:00. Each day keeps its own hours.
      </Text>
      <DayWindows
        windows={value}
        onChange={onChange}
        makeNew={(day) => ({ days: [day], start: "00:00", end: "07:00", style: "vibrate" })}
        renderExtra={(w, set) => (
          <ChipRow
            options={[
              { value: "both", label: "Sound + vibrate" },
              { value: "sound", label: "Sound" },
              { value: "vibrate", label: "Vibrate only" },
            ]}
            value={w.style}
            onChange={(st: AlertStyle) => set({ style: st })}
            testIDPrefix={`${testIDPrefix}-style`}
            padded={false}
          />
        )}
        testIDPrefix={testIDPrefix}
      />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  title: { fontFamily: fonts.text, fontSize: 15, fontWeight: "700", color: c.onSurface },
  note: { fontFamily: fonts.text, fontSize: 12, color: c.muted, marginTop: spacing.xs, marginBottom: spacing.xs },
}));
