import Ionicons from "@react-native-vector-icons/ionicons";
import { Tabs } from "expo-router";
import { NativeTabs } from "expo-router/native-tabs";
import { ColorValue, Platform } from "react-native";

import { usesNativeTabs } from "@/src/navigation";
import { useT } from "@/src/i18n";
import { fonts, useTheme } from "@/src/theme";

export default function TabsLayout() {
  const { colors } = useTheme();
  const t = useT();

  if (usesNativeTabs) {
    return (
      <NativeTabs tintColor={colors.onSurface}>
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Icon sf="drop.fill" />
          <NativeTabs.Trigger.Label>{t("Home")}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="history">
          <NativeTabs.Trigger.Icon sf="clock.arrow.circlepath" />
          <NativeTabs.Trigger.Label>{t("History")}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="stats">
          <NativeTabs.Trigger.Icon sf="chart.bar.fill" />
          <NativeTabs.Trigger.Label>{t("Stats")}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="settings">
          <NativeTabs.Trigger.Icon sf="gearshape.fill" />
          <NativeTabs.Trigger.Label>{t("Settings and tools")}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    );
  }

  const icon =
    (name: "water" | "time" | "stats-chart" | "settings") =>
    ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={name} size={size} color={color} />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.onSurface,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surfaceSecondary,
          borderTopColor: colors.border,
          ...(Platform.OS === "web" ? { height: 64 } : {}),
        },
        tabBarItemStyle: { alignSelf: "center" },
        tabBarLabelStyle: { fontFamily: fonts.text, fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t("Home"), tabBarIcon: icon("water"), tabBarButtonTestID: "tab-home" }} />
      <Tabs.Screen name="history" options={{ title: t("History"), tabBarIcon: icon("time"), tabBarButtonTestID: "tab-history" }} />
      <Tabs.Screen name="stats" options={{ title: t("Stats"), tabBarIcon: icon("stats-chart"), tabBarButtonTestID: "tab-stats" }} />
      <Tabs.Screen name="settings" options={{ title: t("Settings and tools"), tabBarIcon: icon("settings"), tabBarButtonTestID: "tab-settings" }} />
    </Tabs>
  );
}
