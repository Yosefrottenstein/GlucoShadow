import { useMemo, useRef, useState } from "react";
import { GestureResponderEvent, LayoutChangeEvent, View } from "react-native";
import Svg, { Circle, Line, Rect } from "react-native-svg";

import type { Reading, Thresholds } from "@/src/api";
import { levelColor } from "@/src/glucose";
import { useTheme } from "@/src/theme";

type Props = {
  readings: Reading[];
  thresholds: Thresholds;
  yMax: number;
  /** the whole time range the strip shows */
  domainStart: number;
  domainEnd: number;
  /** the part the big graph shows now */
  winStart: number;
  winEnd: number;
  /** the size the window goes to on tap-and-hold (the whole range) */
  defaultSpan: number;
  minSpan?: number;
  onChange: (start: number, end: number) => void;
  testID: string;
  height?: number;
  /** per-point override for dot colour, same idea as GlucoseChart's prop of the same name */
  thresholdsAt?: (ts: number) => Thresholds;
};

const H_PAD = 6;
const HOLD_MS = 500;
const DOUBLE_MS = 320;

/**
 * Overview strip under the graph, like xDrip+: the lit box is what the big graph shows.
 * Drag the box to slide, double-tap or pinch to zoom in, tap and hold to show the whole range.
 */
export function ChartNavigator({ readings, thresholds, thresholdsAt, yMax, domainStart, domainEnd, winStart, winEnd, defaultSpan, minSpan = 30 * 60000, onChange, testID, height = 54 }: Props) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const plotW = Math.max(1, width - H_PAD * 2);
  const domain = Math.max(1, domainEnd - domainStart);
  const tx = (t: number) => H_PAD + ((t - domainStart) / domain) * plotW;
  const Y_MIN = 20; // same scale as the big graph
  const ty = (v: number) => 4 + (1 - (Math.min(yMax, Math.max(Y_MIN, v)) - Y_MIN) / (yMax - Y_MIN)) * (height - 8);
  const tLow = thresholds.tight_low ?? thresholds.target_low;
  const tHigh = thresholds.tight_high ?? thresholds.target_high;

  const g = useRef({ mode: "none" as "none" | "pan" | "pinch", x0: 0, ws: 0, we: 0, d0: 0, moved: false, lastTap: 0, hold: null as ReturnType<typeof setTimeout> | null });
  const latest = useRef({ winStart, winEnd, domainStart, domainEnd, width, plotW, domain });
  latest.current = { winStart, winEnd, domainStart, domainEnd, width, plotW, domain };

  const clamp = (s: number, e: number) => {
    const L = latest.current;
    let span = Math.min(L.domainEnd - L.domainStart, Math.max(minSpan, e - s));
    let a = (s + e) / 2 - span / 2;
    if (a < L.domainStart) a = L.domainStart;
    if (a + span > L.domainEnd) a = L.domainEnd - span;
    onChange(a, a + span);
  };
  const clearHold = () => {
    if (g.current.hold) clearTimeout(g.current.hold);
    g.current.hold = null;
  };
  const timeAt = (px: number) => latest.current.domainStart + ((px - H_PAD) / latest.current.plotW) * latest.current.domain;
  const dist = (e: GestureResponderEvent) => {
    const t = e.nativeEvent.touches;
    return t.length >= 2 ? Math.abs(t[0].pageX - t[1].pageX) + 1 : 0;
  };

  const grant = (e: GestureResponderEvent) => {
    const L = latest.current;
    const G = g.current;
    G.x0 = e.nativeEvent.locationX;
    G.ws = L.winStart;
    G.we = L.winEnd;
    G.moved = false;
    G.mode = "pan";
    clearHold();
    // start on the box -> slide it; start outside -> jump the box there
    const t = timeAt(G.x0);
    if (t < L.winStart || t > L.winEnd) {
      const half = (L.winEnd - L.winStart) / 2;
      G.ws = t - half;
      G.we = t + half;
      clamp(G.ws, G.we);
    }
    G.hold = setTimeout(() => {
      if (!G.moved) {
        const c = (latest.current.winStart + latest.current.winEnd) / 2;
        clamp(c - defaultSpan / 2, c + defaultSpan / 2);
        G.mode = "none";
      }
    }, HOLD_MS);
  };
  const move = (e: GestureResponderEvent) => {
    const G = g.current;
    const L = latest.current;
    if (e.nativeEvent.touches.length >= 2) {
      clearHold();
      const d = dist(e);
      if (G.mode !== "pinch") {
        G.mode = "pinch";
        G.d0 = d;
        G.ws = L.winStart;
        G.we = L.winEnd;
      }
      const c = (G.ws + G.we) / 2;
      const span = (G.we - G.ws) * (G.d0 / d);
      G.moved = true;
      clamp(c - span / 2, c + span / 2);
      return;
    }
    if (G.mode !== "pan") return;
    const dx = e.nativeEvent.locationX - G.x0;
    if (Math.abs(dx) > 4) {
      G.moved = true;
      clearHold();
    }
    if (G.moved) {
      const dt = (dx / L.plotW) * L.domain;
      clamp(G.ws + dt, G.we + dt);
    }
  };
  const release = () => {
    const G = g.current;
    clearHold();
    if (G.mode === "pan" && !G.moved) {
      const now = Date.now();
      if (now - G.lastTap < DOUBLE_MS) {
        const c = (latest.current.winStart + latest.current.winEnd) / 2;
        const span = (latest.current.winEnd - latest.current.winStart) / 2;
        clamp(c - span / 2, c + span / 2);
        G.lastTap = 0;
      } else G.lastTap = now;
    }
    G.mode = "none";
  };

  const pts = useMemo(() => {
    if (!width) return [];
    const step = Math.max(1, Math.floor(readings.length / (plotW / 1.5)));
    return readings.filter((_, i) => i % step === 0);
  }, [readings, width, plotW]);

  const wx = tx(winStart);
  const ww = Math.max(6, tx(winEnd) - wx);

  return (
    <View
      testID={testID}
      style={{ height, marginTop: 6 }}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={grant}
      onResponderMove={move}
      onResponderRelease={release}
      onResponderTerminate={release}
    >
      {width > 0 && (
        <Svg width={width} height={height} pointerEvents="none">
          <Rect x={H_PAD} y={0} width={plotW} height={height} rx={6} fill={colors.surface} />
          <Rect x={H_PAD} y={ty(thresholds.target_high)} width={plotW} height={ty(thresholds.target_low) - ty(thresholds.target_high)} fill={colors.inRange} opacity={0.14} />
          <Rect x={H_PAD} y={ty(tHigh)} width={plotW} height={ty(tLow) - ty(tHigh)} fill="#7ED88A" opacity={0.3} />
          <Line x1={H_PAD} x2={H_PAD + plotW} y1={ty(thresholds.target_high)} y2={ty(thresholds.target_high)} stroke={colors.high} strokeWidth={1} strokeDasharray="4,4" />
          <Line x1={H_PAD} x2={H_PAD + plotW} y1={ty(thresholds.target_low)} y2={ty(thresholds.target_low)} stroke={colors.low} strokeWidth={1} strokeDasharray="4,4" />
          {pts.map((r) => {
            const t = Date.parse(r.ts);
            return <Circle key={r.ts} cx={tx(t)} cy={ty(r.sgv)} r={1.3} fill={levelColor(r.sgv, thresholdsAt ? thresholdsAt(t) : thresholds, colors)} />;
          })}
          <Rect x={wx} y={1} width={ww} height={height - 2} rx={5} fill="none" stroke={colors.brandPrimary} strokeWidth={2} />
        </Svg>
      )}
    </View>
  );
}
