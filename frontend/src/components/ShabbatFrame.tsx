import { ReactNode, useState } from "react";
import { LayoutChangeEvent, View } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";

import { radius, spacing, useTheme } from "@/src/theme";

// light: soft pink and white with hot pink; dark: pine green with yellow-orange and yellow
const PAL = {
  light: { hot: "#FF4FA3", soft: "#FF9CCB", bg: "#FFF3F8", edge: "#FFFFFF" },
  dark: { hot: "#FF9F1C", soft: "#FFE066", bg: "#0B3D2E", edge: "#0B3D2E" },
};

// small fixed pattern (x and y in 0..1, size 0..2) so the dots stay put between renders
const DOTS: [number, number, number][] = [
  [0.08, 0.1, 1], [0.27, 0.05, 0], [0.55, 0.12, 2], [0.78, 0.06, 1], [0.93, 0.15, 0],
  [0.04, 0.3, 0], [0.9, 0.34, 2], [0.12, 0.52, 2], [0.95, 0.55, 1], [0.06, 0.74, 1],
  [0.88, 0.76, 0], [0.2, 0.9, 0], [0.45, 0.95, 2], [0.7, 0.9, 1], [0.94, 0.94, 2],
];

/**
 * The Shabbat settings box. Off: a plain outlined box. On: a calm festive look, soft pink and white
 * with hot pink dots and a string of little flags along the top.
 */
export function ShabbatFrame({ on, children }: { on: boolean; children: ReactNode }) {
  const { colors, scheme } = useTheme();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const dark = scheme === "dark";
  const pal = dark ? PAL.dark : PAL.light;
  const bg = on ? pal.bg : "transparent";
  const border = on ? pal.hot : colors.brandPrimary;

  const flagCount = Math.max(6, Math.round(size.w / 34));
  const fw = size.w / flagCount;

  return (
    <View
      testID="shabbat-box"
      onLayout={(e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      style={{
        borderWidth: 2,
        borderColor: border,
        borderRadius: radius.lg,
        backgroundColor: bg,
        paddingHorizontal: spacing.md,
        paddingBottom: spacing.sm,
        paddingTop: on ? 30 : 0,
        marginTop: spacing.lg,
        overflow: "hidden",
      }}
    >
      {on && size.w > 0 && (
        <Svg width={size.w} height={size.h} pointerEvents="none" style={{ position: "absolute", left: 0, top: 0 }}>
          {DOTS.map(([x, y, k], i) => (
            <Circle key={i} cx={x * size.w} cy={28 + y * (size.h - 36)} r={[3, 5, 7][k]} fill={i % 3 === 0 ? pal.hot : pal.soft} opacity={dark ? 0.55 : 0.45} />
          ))}
          <Line x1={0} y1={3} x2={size.w} y2={3} stroke={pal.hot} strokeWidth={1.2} />
          {Array.from({ length: flagCount }, (_, i) => {
            const x0 = i * fw;
            return (
              <Path
                key={i}
                d={`M${x0 + 2},3 L${x0 + fw - 2},3 L${x0 + fw / 2},${22} Z`}
                fill={i % 2 ? pal.hot : pal.soft}
                stroke={pal.edge}
                strokeWidth={1}
              />
            );
          })}
        </Svg>
      )}
      {children}
    </View>
  );
}
