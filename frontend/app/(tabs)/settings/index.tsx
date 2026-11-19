import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card, Hint, ToggleRow } from "@/src/components/ui";
import { PermissionsList } from "@/src/components/PermissionsList";
import { useSettingsStyles } from "@/src/components/settings/styles";
import { deviceAccessSupported } from "@/src/deviceAccess";
import { FOLLOWER_SOURCES, isFollowerSource, useSettingsScreen } from "@/src/settingsStore";
import { healthPlatform } from "@/src/health";
import { isAndroid } from "@/src/phoneSms";
import { useT } from "@/src/i18n";
import { spacing, useTheme } from "@/src/theme";
import { usesNativeTabs } from "@/src/navigation";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

type Row = { icon: keyof typeof Ionicons.glyphMap | string; title: string; sub: string; route: string; testID: string };

const ROWS: Row[] = [
  { icon: "color-palette-outline", title: "Appearance", sub: "Light, dark, and graph height", route: "/settings/appearance", testID: "settings-menu-appearance" },
  { icon: "speedometer-outline", title: "Glucose & ranges", sub: "Units, target range and tight range", route: "/settings/glucose", testID: "settings-menu-glucose" },
  { icon: "cloud-download-outline", title: "Data source", sub: "Where your glucose readings come from", route: "/settings/source", testID: "settings-menu-source" },
  { icon: "pulse-outline", title: "Sensor session", sub: "Start, stop and sensor-ending reminders", route: "/settings/sensor", testID: "settings-menu-sensor" },
  { icon: "notifications-outline", title: "Alarms", sub: "Alarms, emergency messages and Shabbat mode", route: "/settings/alarms", testID: "settings-menu-alarms" },
  { icon: "cloud-upload-outline", title: "Upload to cloud", sub: "Nightscout, Tidepool and Dexcom Share", route: "/settings/upload", testID: "settings-menu-upload" },
  { icon: "person-circle-outline", title: "Profile", sub: "Name, username, email, password and photo", route: "/settings/profile", testID: "settings-menu-profile" },
];

export default function SettingsMenu() {
  const styles = useSettingsStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const router = useRouter();
  const t = useT();
  const { draft, perms, keepRunning, setKeepRunning } = useSettingsScreen();

  if (!draft) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.brandPrimary} />
      </View>
    );
  }

  // no sensor session can run here while following someone else's device, the companion app or manual entry
  const FOLLOWER = FOLLOWER_SOURCES(isAndroid, healthPlatform);
  const noSensorHere = isFollowerSource(draft.source, FOLLOWER) || draft.source === "companion" || draft.source === "manual";

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={styles.title}>{t("Settings")}</Text>
      </View>
      <KeyboardAwareScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: bottomChrome + 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <Card style={{ paddingVertical: spacing.xs }}>
          {ROWS.map((r, i) => {
            const dimmed = r.route === "/settings/sensor" && noSensorHere;
            return (
              <Pressable
                key={r.route}
                testID={r.testID}
                onPress={() => router.push(r.route as never)}
                style={[styles.radioRow, i > 0 && styles.topBorder, dimmed && { opacity: 0.45 }]}
              >
                <Ionicons name={r.icon as never} size={22} color={dimmed ? colors.muted : colors.brandPrimary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.radioTitle}>{t(r.title)}</Text>
                  <Text style={styles.radioSub}>{dimmed ? t("Not used while following another device") : t(r.sub)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </Pressable>
            );
          })}
        </Card>

        <Card style={{ paddingVertical: spacing.xs, marginTop: spacing.lg }} testID="permissions-card">
          <PermissionsList items={perms.items} state={perms.state} onRefresh={perms.refresh} />
        </Card>
        {deviceAccessSupported && (
          <Card style={{ marginTop: spacing.sm }}>
            <ToggleRow
              label="Keep running in the background"
              sub="Shows a small permanent notification so Android does not stop GlucoShadow when the screen is off"
              value={keepRunning}
              onChange={setKeepRunning}
              testID="keep-running-toggle"
              last
            />
          </Card>
        )}
        <Hint>
          GlucoShadow asks the phone for each of these. Android needs you to confirm the last three in its own settings screen, then come back here.
          Light and dark appearance needs no permission.
        </Hint>

        <Hint>
          This app is for information only. Don&apos;t make treatment decisions from it alone. Confirm with a meter and follow your care
          team&apos;s advice.
        </Hint>
      </KeyboardAwareScrollView>
    </View>
  );
}
