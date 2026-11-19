// Design tokens for this app (light theme, from /app/design_guidelines.json).
import { useMemo, useSyncExternalStore } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

// Light mode: cream + teal, matching the look of the user's original app ("emergent"): a
// calming, classy health-guide feel rather than clinical white/blue.
const light = {
  surface: "#FDFBF7",
  onSurface: "#1C2B2D",
  surfaceSecondary: "#FFFFFF",
  onSurfaceSecondary: "#1C2B2D",
  surfaceTertiary: "#F4EFE6",
  onSurfaceTertiary: "#2C4446",
  surfaceInverse: "#1C2B2D",
  onSurfaceInverse: "#FDFBF7",
  muted: "#748C8E",

  brand: "#2B7A78",
  onBrand: "#FFFFFF",
  brandPrimary: "#2B7A78",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#E2F1F0",
  onBrandSecondary: "#1F5F5D",
  brandTertiary: "#E2F1F0",
  onBrandTertiary: "#1F5F5D",

  success: "#4E9F76",
  onSuccess: "#FFFFFF",
  warning: "#D97706",
  onWarning: "#FFFFFF",
  error: "#D32F2F",
  onError: "#FFFFFF",
  info: "#4A8C8E",
  onInfo: "#FFFFFF",

  border: "#E9E3D9",
  borderStrong: "#D1C7B7",
  divider: "#E9E3D9",

  // glucose ranges (graph dots): red low, sage green in range, amber high
  inRange: "#38B6F5",
  high: "#F2C100",
  low: "#D32F2F",
  // treatment markers
  insulin: "#E07A5F",
  carbs: "#F4A261",
  scrim: "rgba(28, 43, 45, 0.4)",
};

export type ThemeColors = typeof light;

// Dark mode: deep blue background, bright yellow letters. Glucose colours keep their meaning (blue in range, yellow above, red below).
const dark: ThemeColors = {
  surface: "#07123A",
  onSurface: "#FFE53B",
  surfaceSecondary: "#0E1D52",
  onSurfaceSecondary: "#FFE53B",
  surfaceTertiary: "#16286B",
  onSurfaceTertiary: "#F2D84A",
  surfaceInverse: "#FFE53B",
  onSurfaceInverse: "#07123A",
  muted: "#CDB94A",

  brand: "#FFD60A",
  onBrand: "#07123A",
  brandPrimary: "#FFD60A",
  onBrandPrimary: "#07123A",
  brandSecondary: "#1B2F7A",
  onBrandSecondary: "#FFE53B",
  brandTertiary: "#1B2F7A",
  onBrandTertiary: "#FFE53B",

  success: "#6EE7A8",
  onSuccess: "#07123A",
  warning: "#FF9F1C",
  onWarning: "#07123A",
  error: "#FF7B7B",
  onError: "#07123A",
  info: "#7CC4FF",
  onInfo: "#07123A",

  border: "#2A3F8F",
  borderStrong: "#4A62B8",
  divider: "#1C2F78",

  inRange: "#5BC8FA",
  high: "#FFD43B",
  low: "#FF6B6B",
  insulin: "#FF9F7A",
  carbs: "#FFB86B",
  scrim: "rgba(0, 4, 24, 0.7)",
};

export const fonts = { display: "SpaceGrotesk", text: "PlusJakartaSans" };
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };
export const radius = { sm: 8, md: 14, lg: 22, pill: 999 };

export const defaultScheme = "light" satisfies ColorScheme;

export const themes: { light: ThemeColors; dark?: ThemeColors } = { light, dark };

// User choice: "system" follows the phone, or force light/dark. Saved by src/appearance.ts.
export type AppearancePref = "system" | ColorScheme;
let pref: AppearancePref = "system";
const prefListeners = new Set<() => void>();
export const getAppearancePref = () => pref;
export function setAppearancePref(p: AppearancePref) {
  pref = p;
  setColorScheme(p === "system" ? null : p);
  prefListeners.forEach((l) => l());
}
const subscribePref = (l: () => void) => {
  prefListeners.add(l);
  return () => prefListeners.delete(l);
};
export const useAppearancePref = () => useSyncExternalStore(subscribePref, getAppearancePref);

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const p = useAppearancePref();
  const wanted = p === "system" ? system : p;
  const scheme: ColorScheme = (wanted === "light" || wanted === "dark") && themes[wanted] ? wanted : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}
