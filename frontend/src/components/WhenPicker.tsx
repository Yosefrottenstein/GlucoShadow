import Ionicons from "@react-native-vector-icons/ionicons";
import { format, isToday, isYesterday } from "date-fns";
import { Pressable, Text, View } from "react-native";

import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const clamp = (d: Date) => (d.getTime() > Date.now() ? new Date() : d);
const addMinutes = (d: Date, m: number) => clamp(new Date(d.getTime() + m * 60000));
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return clamp(x);
};

/** Date and time of an entry. Starts at the current time; step the date, hour and minute to any moment in the past. */
export function WhenPicker({ value, onChange }: { value: Date; onChange: (d: Date) => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const dayLabel = isToday(value) ? "Today" : isYesterday(value) ? "Yesterday" : format(value, "EEE d MMM");
  const atNow = isToday(value);

  const Step = ({ icon, onPress, disabled, id }: { icon: "chevron-back" | "chevron-forward" | "remove" | "add"; onPress: () => void; disabled?: boolean; id: string }) => (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={6} testID={id} style={[styles.step, disabled && { opacity: 0.35 }]}>
      <Ionicons name={icon} size={20} color={colors.onSurface} />
    </Pressable>
  );

  return (
    <View style={styles.wrap} testID="when-picker">
      <View style={styles.row}>
        <Step icon="chevron-back" onPress={() => onChange(addDays(value, -1))} id="when-day-prev" />
        <Text style={styles.big} testID="when-day">{dayLabel}</Text>
        <Step icon="chevron-forward" onPress={() => onChange(addDays(value, 1))} disabled={atNow} id="when-day-next" />
      </View>
      <View style={styles.row}>
        <Step icon="remove" onPress={() => onChange(addMinutes(value, -60))} id="when-hour-prev" />
        <Text style={styles.big} testID="when-hour">{format(value, "HH")}</Text>
        <Step icon="add" onPress={() => onChange(addMinutes(value, 60))} id="when-hour-next" />
        <Text style={styles.colon}>:</Text>
        <Step icon="remove" onPress={() => onChange(addMinutes(value, -1))} id="when-minute-prev" />
        <Text style={styles.big} testID="when-minute">{format(value, "mm")}</Text>
        <Step icon="add" onPress={() => onChange(addMinutes(value, 1))} id="when-minute-next" />
      </View>
      <View style={[styles.row, { justifyContent: "space-between" }]}>
        <Pressable onPress={() => onChange(addMinutes(value, -5))} testID="when-minus-5" style={styles.chip}>
          <Text style={styles.chipText}>-5 min</Text>
        </Pressable>
        <Pressable onPress={() => onChange(new Date())} testID="when-now" style={[styles.chip, { backgroundColor: colors.brandPrimary }]}>
          <Text style={[styles.chipText, { color: colors.onBrandPrimary }]}>Now</Text>
        </Pressable>
        <Pressable onPress={() => onChange(addMinutes(value, 5))} testID="when-plus-5" style={styles.chip}>
          <Text style={styles.chipText}>+5 min</Text>
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { backgroundColor: c.surface, borderRadius: radius.md, padding: spacing.sm, marginTop: spacing.xs, gap: spacing.xs },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  step: { width: 44, height: 44, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceSecondary },
  big: { fontFamily: fonts.display, fontSize: 22, fontWeight: "700", color: c.onSurface, minWidth: 56, textAlign: "center" },
  colon: { fontFamily: fonts.display, fontSize: 22, fontWeight: "700", color: c.muted },
  chip: { minHeight: 40, paddingHorizontal: spacing.md, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceSecondary },
  chipText: { fontFamily: fonts.text, fontSize: 14, fontWeight: "600", color: c.onSurface },
}));
