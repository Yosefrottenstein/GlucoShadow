import { useEffect, useMemo, useRef, useState } from "react";
import { LayoutChangeEvent, Text, View } from "react-native";
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { format } from "date-fns";

import type { Reading, Thresholds, Treatment, Unit } from "@/src/api";
import { arrow, fmtDateTime, levelColor, toDisplay, unitLabel } from "@/src/glucose";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { getTimeFormat } from "@/src/timeFormat";

type Props = {
  readings: Reading[];
  treatments?: Treatment[];
  start: number;
  end: number;
  thresholds: Thresholds;
  /** when given, used instead of the fixed `thresholds` for colouring each dot (and the
   * in-tight-range chain line) by whatever the range actually was at that reading's own time —
   * so a past day shows its own picture, not today's settings. The shaded band and dashed lines
   * still use the single `thresholds` prop above (the range for the day/window being shown). */
  thresholdsAt?: (ts: number) => Thresholds;
  unit: Unit;
  height?: number;
  /** top of the graph in mg/dL (300 or 400) */
  yMax?: number;
  averaged?: boolean;
  testID: string;
};

const PAD_L = 34;
const PAD_R = 10;
const PAD_T = 22;
const PAD_B = 22;
const Y_MIN = 20;

export function GlucoseChart({ readings, treatments = [], start, end, thresholds, thresholdsAt, unit, height = 200, yMax = 400, averaged, testID }: Props) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [width, setWidth] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const times = useMemo(() => readings.map((r) => Date.parse(r.ts)), [readings]);

  useEffect(() => setSel(null), [readings, start, end]);
  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);

  const plotW = Math.max(1, width - PAD_L - PAD_R);
  const plotH = height - PAD_T - PAD_B;
  const x = (t: number) => PAD_L + ((t - start) / (end - start)) * plotW;
  const y = (v: number) => PAD_T + (1 - (Math.min(yMax, Math.max(Y_MIN, v)) - Y_MIN) / (yMax - Y_MIN)) * plotH;

  const useLine = readings.length > 400;
  const linePath = useMemo(() => {
    if (!useLine || !width) return "";
    const gap = Math.max(15 * 60000, ((end - start) / Math.max(1, readings.length)) * 4);
    let d = "";
    readings.forEach((r, i) => {
      const cmd = i === 0 || times[i] - times[i - 1] > gap ? "M" : "L";
      d += `${cmd}${x(times[i]).toFixed(1)},${y(r.sgv).toFixed(1)}`;
    });
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useLine, readings, times, width, start, end, yMax]);

  const pick = (px: number) => {
    if (!readings.length || !width) return;
    const t = start + ((px - PAD_L) / plotW) * (end - start);
    let lo = 0;
    let hi = times.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (times[mid] < t) lo = mid + 1;
      else hi = mid;
    }
    const idx = lo > 0 && Math.abs(times[lo - 1] - t) < Math.abs(times[lo] - t) ? lo - 1 : lo;
    setSel(idx);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setSel(null), 6000);
  };

  const span = end - start;
  const xTicks = [0, 1, 2, 3, 4].map((i) => start + (span * i) / 4);
  const xLabel = (t: number) => (span <= 36 * 3600000 ? format(t, getTimeFormat() === "12h" ? "h:mm a" : "HH:mm") : format(t, "MMM d"));
  const yTicks = [thresholds.target_low, thresholds.target_high, 250, yMax]
    .filter((v, i, a) => v > Y_MIN && v <= yMax && a.indexOf(v) === i)
    .sort((a, b) => a - b)
    .filter((v, i, a) => i === 0 || y(v) - y(a[i - 1]) <= -14); // keep labels 14px apart
  const dotR = span <= 4 * 3600000 ? 3.6 : span <= 13 * 3600000 ? 3 : 2.4;
  const tightLow = thresholds.tight_low ?? thresholds.target_low;
  const tightHigh = thresholds.tight_high ?? thresholds.target_high;
  const thresholdsFor = (i: number) => (thresholdsAt ? thresholdsAt(times[i]) : thresholds);
  const inTight = (v: number, i: number) => {
    const t = thresholdsFor(i);
    const lo = t.tight_low ?? t.target_low;
    const hi = t.tight_high ?? t.target_high;
    return v >= lo && v <= hi;
  };
  const selReading = sel !== null ? readings[sel] : null;

  return (
    <View
      testID={testID}
      style={{ height }}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onResponderTerminationRequest={() => true}
      onResponderGrant={(e) => pick(e.nativeEvent.locationX)}
      onResponderMove={(e) => pick(e.nativeEvent.locationX)}
    >
      {width > 0 && (
        <Svg width={width} height={height} pointerEvents="none">
          <Rect
            x={PAD_L}
            y={y(thresholds.target_high)}
            width={plotW}
            height={y(thresholds.target_low) - y(thresholds.target_high)}
            fill={colors.inRange}
            opacity={0.1}
          />
          <Rect x={PAD_L} y={y(tightHigh)} width={plotW} height={y(tightLow) - y(tightHigh)} fill="#7ED88A" opacity={0.28} />
          {[thresholds.urgent_low, thresholds.urgent_high].map((v) => (
            <Line key={v} x1={PAD_L} x2={PAD_L + plotW} y1={y(v)} y2={y(v)} stroke={colors.low} strokeWidth={0.6} strokeDasharray="2,4" opacity={0.6} />
          ))}
          {[thresholds.target_low, thresholds.target_high].map((v) => (
            <Line key={v} x1={PAD_L} x2={PAD_L + plotW} y1={y(v)} y2={y(v)} stroke={v === thresholds.target_low ? colors.low : colors.high} strokeWidth={1} strokeDasharray="4,4" />
          ))}
          {yTicks.map((v) => (
            <SvgText key={v} x={PAD_L - 6} y={y(v) + 4} fontSize={10} fill={colors.muted} textAnchor="end">
              {toDisplay(v, unit)}
            </SvgText>
          ))}
          {xTicks.map((t, i) => (
            <G key={t}>
              <Line x1={x(t)} x2={x(t)} y1={PAD_T} y2={PAD_T + plotH} stroke={colors.divider} strokeWidth={0.6} />
              <SvgText
                x={x(t)}
                y={height - 6}
                fontSize={10}
                fill={colors.muted}
                textAnchor={i === 0 ? "start" : i === 4 ? "end" : "middle"}
              >
                {xLabel(t)}
              </SvgText>
            </G>
          ))}
          {useLine ? (
            <Path d={linePath} stroke={colors.onSurfaceTertiary} strokeWidth={1.4} fill="none" />
          ) : (
            <>
              {readings.map((r, i) =>
                i > 0 && inTight(r.sgv, i) && inTight(readings[i - 1].sgv, i - 1) && times[i] - times[i - 1] <= 15 * 60000 ? (
                  <Line key={`chain-${r.ts}`} x1={x(times[i - 1])} y1={y(readings[i - 1].sgv)} x2={x(times[i])} y2={y(r.sgv)} stroke={colors.inRange} strokeWidth={1.8} />
                ) : null,
              )}
              {readings.map((r, i) => (
                <Circle key={r.ts} cx={x(times[i])} cy={y(r.sgv)} r={dotR} fill={levelColor(r.sgv, thresholdsFor(i), colors)} />
              ))}
            </>
          )}
          {treatments.map((t) => {
            const tx = x(Date.parse(t.ts));
            if (tx < PAD_L || tx > PAD_L + plotW) return null;
            if (t.kind === "insulin") {
              const by = PAD_T + plotH - 4;
              return (
                <G key={t.id}>
                  <Path d={`M${tx - 5},${by} L${tx + 5},${by} L${tx},${by - 9} Z`} fill={colors.insulin} />
                  <SvgText x={tx} y={by - 12} fontSize={9} fill={colors.insulin} textAnchor="middle" fontWeight="bold">
                    {`${t.insulin}U`}
                  </SvgText>
                </G>
              );
            }
            if (t.kind === "carbs") {
              return (
                <G key={t.id}>
                  <Circle cx={tx} cy={PAD_T - 10} r={5} fill={colors.carbs} />
                  <SvgText x={tx + 8} y={PAD_T - 7} fontSize={9} fill={colors.carbs} fontWeight="bold">
                    {`${t.carbs}g`}
                  </SvgText>
                </G>
              );
            }
            return <Rect key={t.id} x={tx - 4} y={PAD_T - 14} width={8} height={8} rx={2} fill={colors.muted} />;
          })}
          {selReading && sel !== null && (
            <G>
              <Line x1={x(times[sel])} x2={x(times[sel])} y1={PAD_T} y2={PAD_T + plotH} stroke={colors.onSurface} strokeWidth={0.8} opacity={0.4} />
              <Circle cx={x(times[sel])} cy={y(selReading.sgv)} r={7} fill="none" stroke={colors.onSurface} strokeWidth={2} />
            </G>
          )}
        </Svg>
      )}
      {selReading && sel !== null && (
        <View
          pointerEvents="none"
          testID={`${testID}-tooltip`}
          style={[
            styles.tooltip,
            {
              left: Math.min(Math.max(0, x(times[sel]) - 64), width - 128),
              top: y(selReading.sgv) > height / 2 ? PAD_T : y(selReading.sgv) + 12,
            },
          ]}
        >
          <Text style={styles.tipValue} testID={`${testID}-tooltip-value`}>
            {toDisplay(selReading.sgv, unit)} <Text style={styles.tipUnit}>{unitLabel(unit)}</Text> {arrow(selReading.direction)}
          </Text>
          <Text style={styles.tipTime} testID={`${testID}-tooltip-time`}>
            {averaged ? "avg · " : ""}
            {fmtDateTime(selReading.ts)}
          </Text>
        </View>
      )}
      {readings.length === 0 && width > 0 && (
        <View pointerEvents="none" style={styles.empty}>
          <Text style={styles.emptyText}>No readings in this period</Text>
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  tooltip: {
    position: "absolute",
    width: 128,
    backgroundColor: c.surfaceInverse,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: "center",
  },
  tipValue: { color: c.onSurfaceInverse, fontFamily: fonts.display, fontSize: 18, fontWeight: "700" },
  tipUnit: { fontSize: 11, fontWeight: "400" },
  tipTime: { color: c.onSurfaceInverse, opacity: 0.8, fontFamily: fonts.text, fontSize: 12, marginTop: 2 },
  empty: { ...({ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 } as const), alignItems: "center", justifyContent: "center" },
  emptyText: { color: c.muted, fontFamily: fonts.text, fontSize: 14 },
}));
