import Ionicons from "@react-native-vector-icons/ionicons";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CategoryHeader } from "@/src/components/settings/CategoryHeader";
import { useSettingsStyles } from "@/src/components/settings/styles";
import { MultiChipRow } from "@/src/components/ChipRow";
import { Button, Card, Hint, ToggleRow } from "@/src/components/ui";
import { SensorStartSheet } from "@/src/components/SensorStartSheet";
import { offsetLabel, sensorEndsText, sensorWarmupLeftMs, sensorWarmupText } from "@/src/sensorAlerts";
import { soundText } from "@/src/components/settings/AlarmsSection";
import { FOLLOWER_SOURCES, isFollowerSource, useSettingsScreen } from "@/src/settingsStore";
import { healthPlatform } from "@/src/health";
import { isAndroid } from "@/src/phoneSms";
import { spacing, useTheme } from "@/src/theme";
import { useClock } from "@/src/timeFormat";
import { usesNativeTabs } from "@/src/navigation";

export default function SensorScreen() {
  const styles = useSettingsStyles();
  const { colors } = useTheme();
  const { fmtClockDate } = useClock();
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const { draft, set, settings, sensorLocked, startSensor, stopSensor, startSheet, setStartSheet, startNow, ensureNotifications, setSoundEdit } = useSettingsScreen();

  if (!draft) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.brandPrimary} />
      </View>
    );
  }

  const FOLLOWER = FOLLOWER_SOURCES(isAndroid, healthPlatform);
  const mode = isFollowerSource(draft.source, FOLLOWER) ? "follower" : "master";

  if (mode === "follower" || draft.source === "companion" || draft.source === "manual") {
    return (
      <View style={styles.root}>
        <CategoryHeader title="Sensor session" />
        <KeyboardAwareScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: bottomChrome + 32 }}>
          <Hint>
            {mode === "follower"
              ? "Sensor session timing is tracked by whichever app or cloud service runs the sensor itself. Switch Data source to Master to time it here instead."
              : "Manual entry and the companion app don't run a sensor session here."}
          </Hint>
        </KeyboardAwareScrollView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <CategoryHeader title="Sensor session" />
      <KeyboardAwareScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: bottomChrome + 32 }}>
        <Card style={{ paddingVertical: spacing.xs }}>
          {sensorLocked ? (
            <>
              <View style={[styles.syncRow, { marginTop: 0, paddingVertical: spacing.sm }, styles.bottomBorder]}>
                <Text style={styles.radioSub}>Started</Text>
                <Text style={styles.radioTitle} testID="sensor-started-locked">
                  {fmtClockDate(settings.data!.sensor_started_at!)}
                </Text>
              </View>
              <View style={[styles.syncRow, { marginTop: 0, paddingVertical: spacing.sm }, styles.bottomBorder]}>
                <Text style={styles.syncText} testID="sensor-ends-text">
                  {sensorEndsText(new Date(Date.parse(settings.data!.sensor_started_at!) + draft.sensor_days * 86400000))}
                </Text>
              </View>
              {(() => {
                const left = sensorWarmupLeftMs({ sensor_started_at: settings.data!.sensor_started_at, bt_sensor: draft.bt_sensor });
                return left != null ? (
                  <View style={[styles.syncRow, { marginTop: 0, paddingVertical: spacing.sm }, styles.bottomBorder]}>
                    <Ionicons name="hourglass-outline" size={16} color={colors.warning} />
                    <Text style={[styles.syncText, { color: colors.warning }]} testID="sensor-warmup-text">
                      {sensorWarmupText(left)}
                    </Text>
                  </View>
                ) : null;
              })()}
              <Button title="Stop sensor" kind="danger" onPress={stopSensor} testID="sensor-stop-button" style={{ marginVertical: spacing.sm }} />
              <Button title="Start a new sensor" kind="secondary" disabled onPress={() => {}} testID="sensor-new-button" style={{ opacity: 0.45 }} />
              <Text style={[styles.radioSub, { paddingTop: spacing.xs }]}>Available after you stop this sensor.</Text>
              <Text style={[styles.radioSub, { paddingVertical: spacing.sm }]}>
                The start time is locked while this sensor is in use.
              </Text>
            </>
          ) : (
            <>
              <View style={[styles.syncRow, { marginTop: 0, paddingVertical: spacing.sm }, styles.bottomBorder]}>
                <Text style={styles.syncText} testID="sensor-ends-text">No sensor is running</Text>
                <Button title="Start sensor" onPress={startSensor} testID="sensor-start-button" />
              </View>
              <Text style={[styles.radioSub, { paddingVertical: spacing.sm }]}>The start time is saved automatically when you tap Start sensor.</Text>
            </>
          )}
          <ToggleRow
            label="Sensor ending alarm"
            sub="Phone notifications, even when the app is closed"
            value={draft.sensor_warn_enabled}
            onChange={(v) => {
              set("sensor_warn_enabled", v);
              if (v) ensureNotifications();
            }}
            testID="sensor-warn-toggle"
            last={!draft.sensor_warn_enabled}
          />
          {draft.sensor_warn_enabled && (
            <>
              <View style={[styles.inlineChips, styles.bottomBorder]}>
                <Text style={styles.inlineLabel}>Alert me before the end</Text>
                <MultiChipRow
                  options={[1440, 720, 360, 60, 30, 10].map((m) => ({ value: String(m), label: offsetLabel(m) }))}
                  values={draft.sensor_warn_offsets.map(String)}
                  onChange={(v) => set("sensor_warn_offsets", v.map(Number).sort((a, b) => b - a))}
                  testIDPrefix="sensor-warn-offset"
                />
              </View>
              <Pressable testID="sensor-warn-sound-button" onPress={() => setSoundEdit("sensor")} style={styles.soundRow}>
                <Ionicons name="musical-notes" size={18} color={colors.brandPrimary} />
                <Text style={[styles.radioTitle, { flex: 1 }]}>Alert sound</Text>
                <Text style={styles.radioSub}>{soundText({ style: draft.sensor_warn_style, sound: draft.sensor_warn_sound })}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </Pressable>
            </>
          )}
        </Card>
        <Hint>
          A G7 connected by Bluetooth sets the start time automatically. &quot;Vibrate only&quot; reminders are silent when the app is closed
          on iPhone, and vibrate when it&apos;s open.
        </Hint>
      </KeyboardAwareScrollView>

      <SensorStartSheet visible={startSheet} sensor={draft.bt_sensor} transmitterId={draft.bt_transmitter_id} onClose={() => setStartSheet(false)} onStarted={startNow} />
    </View>
  );
}
