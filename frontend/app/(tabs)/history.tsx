import Ionicons from "@react-native-vector-icons/ionicons";
import { useQuery } from "@tanstack/react-query";
import { addDays, endOfDay, format, isToday, startOfDay } from "date-fns";
import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, qs, Reading, Settings, Stats, Status, ThresholdSnapshot, Treatment } from "@/src/api";
import { ChipRow } from "@/src/components/ChipRow";
import { ChartNavigator } from "@/src/components/ChartNavigator";
import { GlucoseChart } from "@/src/components/GlucoseChart";
import { Card } from "@/src/components/ui";
import { arrow, fmtDateTime, fmtTime, levelColor, toDisplay, unitLabel } from "@/src/glucose";
import { usesNativeTabs } from "@/src/navigation";
import { thresholdResolver } from "@/src/thresholdHistory";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const PERIODS = [
  { value: "1", label: "Day to Date" },
  { value: "7", label: "By 7 days" },
  { value: "30", label: "By 30 days" },
  { value: "90", label: "By 90 days" },
] as const;
type Period = (typeof PERIODS)[number]["value"];
const BUCKET: Record<Period, number> = { "1": 0, "7": 15, "30": 60, "90": 180 };
// how far back each view can step: 90 days, 12 weeks, 3 months, just the last 90 days
const MAX_OFFSET: Record<Period, number> = { "1": 89, "7": 11, "30": 2, "90": 0 };

type Row = { key: string; ts: string; reading?: Reading; treatment?: Treatment };

export default function History() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const [period, setPeriod] = useState<Period>("1");
  const [dayOffset, setDayOffset] = useState(0);
  const [win, setWin] = useState<{ start: number; end: number } | null>(null);

  const status = useQuery({ queryKey: ["status"], queryFn: () => api<Status>("/status") });
  const { start, end } = useMemo(() => {
    const n = Number(period);
    const last = addDays(new Date(), -n * dayOffset);
    return { start: startOfDay(addDays(last, -(n - 1))), end: isToday(last) ? new Date() : endOfDay(last) };
  }, [period, dayOffset]);
  const maxOffset = MAX_OFFSET[period];

  const range = { start: start.toISOString(), end: end.toISOString() };
  const readings = useQuery({
    queryKey: ["readings", "history", period, dayOffset],
    queryFn: () => api<Reading[]>(`/readings${qs({ ...range, bucket: BUCKET[period] })}`),
  });
  const treatments = useQuery({
    queryKey: ["treatments", "history", period, dayOffset],
    queryFn: () => api<Treatment[]>(`/treatments${qs(range)}`),
  });
  const stats = useQuery({
    queryKey: ["stats", "history", period, dayOffset],
    queryFn: () => api<Stats>(`/stats${qs(range)}`),
  });

  const settings = useQuery({ queryKey: ["settings"], queryFn: () => api<Settings>("/settings") });
  const graphMax = settings.data?.graph_max ?? 400;
  const unit = status.data?.unit ?? "mgdl";
  const thresholds = status.data?.thresholds ?? { urgent_low: 50, low: 70, high: 180, urgent_high: 250, target_low: 70, target_high: 180, tight_low: 70, tight_high: 140 };

  // every dated change ever made to the ranges above, so a past day can show its own true picture
  // (its own band, its own dot colours) instead of being painted with today's current settings
  const thresholdHistory = useQuery({
    queryKey: ["thresholds-history"],
    queryFn: () => api<ThresholdSnapshot[]>("/thresholds-history"),
  });
  const thresholdsAt = useMemo(() => thresholdResolver(thresholdHistory.data, thresholds), [thresholdHistory.data, thresholds]);

  // whole period shown in the strip; the big graph shows the window (whole period until you zoom)
  const domainStart = start.getTime();
  const domainEnd = period === "1" ? endOfDay(start).getTime() : end.getTime();
  const winStart = win ? Math.max(domainStart, win.start) : domainStart;
  const winEnd = win ? Math.min(domainEnd, win.end) : domainEnd;
  const zoomed = !!win && winEnd - winStart < domainEnd - domainStart - 1000;
  const winReadings = useMemo(
    () => (zoomed ? (readings.data ?? []).filter((r) => { const t = Date.parse(r.ts); return t >= winStart && t <= winEnd; }) : readings.data ?? []),
    [readings.data, zoomed, winStart, winEnd],
  );
  // the band/dashed-lines on the graph show one range at a time: whatever was in effect for the
  // day/window actually being viewed, not necessarily today's current settings
  const windowThresholds = useMemo(() => thresholdsAt((winStart + winEnd) / 2), [thresholdsAt, winStart, winEnd]);

  const rows: Row[] = useMemo(() => {
    const t: Row[] = (treatments.data ?? []).map((x) => ({ key: `t-${x.id}`, ts: x.ts, treatment: x }));
    // readings are on the graph only; the list shows entries (insulin, carbs, calibrations, notes)
    return t.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
  }, [treatments.data]);

  const dayLabel =
    period === "1"
      ? dayOffset === 0
        ? "Today"
        : dayOffset === 1
          ? "Yesterday"
          : format(start, "EEE, MMM d")
      : `${format(start, "MMM d")} – ${dayOffset === 0 ? "Today" : format(end, "MMM d")}`;

  const header = (
    <View style={{ gap: spacing.md }}>
      <Card style={{ paddingHorizontal: spacing.sm }}>
        {readings.isLoading ? (
          <View style={{ height: 260, justifyContent: "center" }}>
            <ActivityIndicator color={colors.brandPrimary} />
          </View>
        ) : (
          <GlucoseChart
            testID="history-glucose-chart"
            readings={winReadings}
            treatments={period === "1" || zoomed ? treatments.data : []}
            start={winStart}
            end={winEnd}
            thresholds={windowThresholds}
            thresholdsAt={thresholdsAt}
            unit={unit}
            yMax={graphMax}
            height={230}
            averaged={BUCKET[period] > 0}
          />
        )}
        {!readings.isLoading && (
          <ChartNavigator
            testID="history-chart-navigator"
            readings={readings.data ?? []}
            thresholds={windowThresholds}
            thresholdsAt={thresholdsAt}
            yMax={graphMax}
            domainStart={domainStart}
            domainEnd={domainEnd}
            winStart={winStart}
            winEnd={winEnd}
            defaultSpan={domainEnd - domainStart}
            minSpan={Math.min(domainEnd - domainStart, period === "1" ? 30 * 60000 : 3 * 3600000)}
            onChange={(a, b) => setWin({ start: a, end: b })}
          />
        )}
        <Text style={styles.hint}>Tap the graph to see values · slide the box, double-tap or pinch to zoom · hold to show everything</Text>
      </Card>
      {stats.data && stats.data.count > 0 && (
        <View style={styles.statsRow}>
          <Mini label="In range" value={`${stats.data.tir?.in_range}%`} testID="history-tir" />
          <Mini label="Average" value={toDisplay(stats.data.average ?? 0, unit)} testID="history-average" />
          <Mini label="Low" value={toDisplay(stats.data.min ?? 0, unit)} testID="history-min" />
          <Mini label="High" value={toDisplay(stats.data.max ?? 0, unit)} testID="history-max" />
        </View>
      )}
      <Text style={styles.listTitle}>Insulin, carbs and notes</Text>
    </View>
  );

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={styles.title}>History</Text>
        <ChipRow
          options={[...PERIODS]}
          value={period}
          onChange={(p) => {
            setPeriod(p);
            setDayOffset(0);
            setWin(null);
          }}
          testIDPrefix="history-period"
        />
        {maxOffset > 0 ? (
          <View style={styles.dayNav}>
            <Pressable
              testID="history-prev-day"
              disabled={dayOffset >= maxOffset}
              onPress={() => { setDayOffset((d) => Math.min(maxOffset, d + 1)); setWin(null); }}
              style={styles.navBtn}
            >
              <Ionicons name="chevron-back" size={22} color={dayOffset >= maxOffset ? colors.borderStrong : colors.onSurface} />
            </Pressable>
            <Text style={styles.dayLabel} testID="history-day-label">
              {dayLabel}
            </Text>
            <Pressable
              testID="history-next-day"
              disabled={dayOffset === 0}
              onPress={() => { setDayOffset((d) => Math.max(0, d - 1)); setWin(null); }}
              style={styles.navBtn}
            >
              <Ionicons name="chevron-forward" size={22} color={dayOffset === 0 ? colors.borderStrong : colors.onSurface} />
            </Pressable>
          </View>
        ) : (
          <Text style={[styles.dayLabel, { textAlign: "center", paddingVertical: spacing.sm }]} testID="history-day-label">
            {dayLabel}
          </Text>
        )}
      </View>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        ListHeaderComponent={header}
        contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: bottomChrome + 24 }}
        initialNumToRender={30}
        ListEmptyComponent={
          readings.isLoading ? undefined : <Text style={styles.empty}>Nothing logged in this period.</Text>
        }
        renderItem={({ item, index }) => (
          <View style={[styles.row, index === 0 && styles.first, index === rows.length - 1 && styles.last]}>
            {item.reading ? (
              <>
                <View style={[styles.bullet, { backgroundColor: levelColor(item.reading.sgv, thresholdsAt(Date.parse(item.ts)), colors) }]} />
                <Text style={styles.rowValue}>
                  {toDisplay(item.reading.sgv, unit)} <Text style={styles.rowUnit}>{unitLabel(unit)}</Text> {arrow(item.reading.direction)}
                </Text>
              </>
            ) : (
              <>
                <Ionicons
                  name={item.treatment!.kind === "insulin" ? "eyedrop" : item.treatment!.kind === "carbs" ? "restaurant" : item.treatment!.kind === "calibration" ? "water" : "document-text"}
                  size={16}
                  color={item.treatment!.kind === "insulin" ? colors.insulin : item.treatment!.kind === "carbs" ? colors.carbs : item.treatment!.kind === "calibration" ? colors.brandPrimary : colors.muted}
                />
                <Text style={styles.rowValue} numberOfLines={1}>
                  {item.treatment!.kind === "insulin"
                    ? `${item.treatment!.insulin} U insulin`
                    : item.treatment!.kind === "carbs"
                      ? `${item.treatment!.carbs} g carbs`
                      : item.treatment!.kind === "calibration"
                        ? `Calibration ${toDisplay(item.treatment!.glucose ?? 0, unit)} ${unitLabel(unit)}${item.treatment!.cgm ? ` (CGM ${toDisplay(item.treatment!.cgm!, unit)})` : ""}`
                        : item.treatment!.note}
                  {item.treatment!.kind !== "note" && item.treatment!.note ? ` · ${item.treatment!.note}` : ""}
                </Text>
              </>
            )}
            <Text style={styles.rowTime}>{period === "1" ? fmtTime(item.ts) : fmtDateTime(item.ts)}</Text>
          </View>
        )}
      />
    </View>
  );
}

function Mini({ label, value, testID }: { label: string; value: string; testID: string }) {
  const styles = useStyles();
  return (
    <View style={styles.mini}>
      <Text style={styles.miniValue} testID={testID}>
        {value}
      </Text>
      <Text style={styles.miniLabel}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { backgroundColor: c.surface, borderBottomWidth: 0.5, borderBottomColor: c.divider },
  title: { fontFamily: fonts.display, fontSize: 28, fontWeight: "700", color: c.onSurface, paddingHorizontal: spacing.lg },
  dayNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.sm, paddingBottom: spacing.xs },
  navBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  dayLabel: { fontFamily: fonts.text, fontSize: 16, fontWeight: "700", color: c.onSurface },
  hint: { fontFamily: fonts.text, fontSize: 11, color: c.muted, textAlign: "center", marginTop: spacing.xs },
  statsRow: { flexDirection: "row", gap: spacing.sm },
  mini: { flex: 1, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md },
  miniValue: { fontFamily: fonts.display, fontSize: 18, fontWeight: "700", color: c.onSurface },
  miniLabel: { fontFamily: fonts.text, fontSize: 11, color: c.muted, marginTop: 2 },
  listTitle: { fontFamily: fonts.display, fontSize: 17, fontWeight: "700", color: c.onSurface, marginTop: spacing.sm, marginBottom: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: c.surfaceSecondary,
    paddingHorizontal: spacing.lg,
    minHeight: 46,
    borderBottomWidth: 0.5,
    borderBottomColor: c.divider,
  },
  first: { borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md },
  last: { borderBottomLeftRadius: radius.md, borderBottomRightRadius: radius.md, borderBottomWidth: 0 },
  bullet: { width: 10, height: 10, borderRadius: 5 },
  rowValue: { flex: 1, fontFamily: fonts.text, fontSize: 15, fontWeight: "600", color: c.onSurface },
  rowUnit: { fontSize: 12, color: c.muted, fontWeight: "400" },
  rowTime: { fontFamily: fonts.text, fontSize: 13, color: c.muted },
  empty: { fontFamily: fonts.text, fontSize: 14, color: c.muted, textAlign: "center", padding: spacing.lg },
}));
