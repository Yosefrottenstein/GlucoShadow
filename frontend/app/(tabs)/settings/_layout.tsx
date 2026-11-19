import Ionicons from "@react-native-vector-icons/ionicons";
import { Stack } from "expo-router";
import { Linking, Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Settings } from "@/src/api";
import { AlarmActivity } from "@/src/components/AlarmActivity";
import { ChipRow } from "@/src/components/ChipRow";
import { Sheet } from "@/src/components/Sheet";
import { SoundPicker } from "@/src/components/SoundPicker";
import { StyleHours } from "@/src/components/StyleHours";
import { DaySettingsContext } from "@/src/components/ScheduleEditor";
import { SOUND_TITLES } from "@/src/components/settings/soundTitles";
import { TimingFields } from "@/src/components/settings/AlarmsSection";
import { useSettingsStyles } from "@/src/components/settings/styles";
import { Button, Card, Field, ToggleRow } from "@/src/components/ui";
import { stopSound } from "@/src/sounds";
import { unitLabel } from "@/src/glucose";
import { SettingsProvider, useSettingsScreen } from "@/src/settingsStore";
import { spacing, useTheme } from "@/src/theme";

/**
 * Settings is a small stack of its own: a main menu (index) and one screen per category.
 * Everything shares the same draft/save state via SettingsProvider, and the two permission
 * sheets (location, notifications) are rendered here once so they work from any category.
 */
export default function SettingsLayout() {
  return (
    <SettingsProvider>
      <PermissionSheets />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="appearance" />
        <Stack.Screen name="glucose" />
        <Stack.Screen name="source" />
        <Stack.Screen name="sensor" />
        <Stack.Screen name="alarms" />
        <Stack.Screen name="upload" />
        <Stack.Screen name="profile" />
      </Stack>
    </SettingsProvider>
  );
}

function PermissionSheets() {
  const {
    permSheet, setPermSheet, requestLocation, notifSheet, setNotifSheet, requestNotifications,
    draft, set, setDraft, setDirty, thr, setThr, soundEdit, setSoundEdit,
  } = useSettingsScreen();
  const styles = useSettingsStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <DaySettingsContext.Provider value={!draft?.shabbat_mode}>
      <Sheet
        visible={!!soundEdit}
        onClose={() => setSoundEdit(null)}
        title={soundEdit ? (soundEdit === "sensor" ? "Sensor reminder sound" : `Edit ${SOUND_TITLES[soundEdit].toLowerCase()} alarm`) : ""}
        testID="alarm-sound-sheet"
      >
        {draft && soundEdit && soundEdit !== "sensor" && soundEdit !== "extreme_low" && (
          <>
            <Card style={{ paddingVertical: spacing.xs }}>
              <ToggleRow
                label="Alarm on"
                sub="Switch the whole alarm off until you switch it on again"
                value={draft[`alarm_${soundEdit}` as keyof Settings] as boolean}
                onChange={(v) => set(`alarm_${soundEdit}` as keyof Settings, v as never)}
                testID={`alarm-${soundEdit}-on`}
                last={soundEdit === "missed"}
              />
              {soundEdit !== "missed" && (
                <Field
                  label={soundEdit === "low" ? "Alert below" : "Alert above"}
                  value={thr[soundEdit as "low" | "high" | "urgent_high"]}
                  onChangeText={(v) => setThr(soundEdit as "low" | "high" | "urgent_high", v)}
                  keyboardType="decimal-pad"
                  suffix={unitLabel(draft.unit)}
                  testID={`alarm-threshold-${soundEdit}`}
                  last
                />
              )}
            </Card>
            {soundEdit === "missed" && (
              <View style={{ marginTop: spacing.md }}>
                <Text style={styles.inlineLabel}>Lost connection after</Text>
                <ChipRow
                  options={[20, 30, 40, 50, 60].map((m) => ({ value: String(m), label: `${m} min` }))}
                  value={String(draft.missed_minutes)}
                  onChange={(v) => set("missed_minutes", Number(v) as never)}
                  testIDPrefix="alarm-missed-minutes"
                  padded={false}
                />
              </View>
            )}
            <AlarmActivity
              days={draft.alarm_sounds[soundEdit].days ?? [0, 1, 2, 3, 4, 5, 6]}
              offWindows={draft.alarm_sounds[soundEdit].off_windows ?? []}
              onChange={(v) => set("alarm_sounds", { ...draft.alarm_sounds, [soundEdit]: { ...draft.alarm_sounds[soundEdit], ...v } })}
              testIDPrefix={`alarm-${soundEdit}-active`}
            />
          </>
        )}
        {draft && soundEdit && (
          <SoundPicker
            value={soundEdit === "sensor" ? { style: draft.sensor_warn_style, sound: draft.sensor_warn_sound } : draft.alarm_sounds[soundEdit]}
            soundOnly={soundEdit === "extreme_low"}
            onChange={(v) => {
              if (soundEdit === "sensor") {
                setDraft((d) => (d ? { ...d, sensor_warn_style: v.style, sensor_warn_sound: v.sound } : d));
                setDirty(true);
              } else set("alarm_sounds", { ...draft.alarm_sounds, [soundEdit]: v });
            }}
            testIDPrefix="alarm-sound"
          />
        )}
        {draft && soundEdit && soundEdit !== "sensor" && (
          <TimingFields
            value={draft.alarm_sounds[soundEdit]}
            onChange={(v) => set("alarm_sounds", { ...draft.alarm_sounds, [soundEdit]: { ...draft.alarm_sounds[soundEdit], ...v } })}
            testIDPrefix={`alarm-${soundEdit}`}
          />
        )}
        {draft && soundEdit && soundEdit !== "sensor" && soundEdit !== "extreme_low" && (
          <StyleHours
            value={draft.alarm_sounds[soundEdit].windows ?? []}
            onChange={(w) => set("alarm_sounds", { ...draft.alarm_sounds, [soundEdit]: { ...draft.alarm_sounds[soundEdit], windows: w } })}
            testIDPrefix={`alarm-${soundEdit}-hours`}
          />
        )}
        <Button title="Done" onPress={() => (stopSound(), setSoundEdit(null))} testID="alarm-sound-done-button" style={{ marginTop: spacing.lg }} />
      </Sheet>

      <Modal visible={!!notifSheet} transparent animationType="slide" onRequestClose={() => setNotifSheet(null)}>
        <Pressable style={styles.backdrop} onPress={() => setNotifSheet(null)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} testID="notification-permission-sheet">
          <Ionicons name="notifications" size={32} color={colors.brandPrimary} />
          <Text style={styles.sheetTitle}>Get reminded before your sensor ends</Text>
          <Text style={styles.sheetBody}>
            {notifSheet === "settings"
              ? "Notifications are turned off for this app. Turn them on in Settings to get sensor reminders."
              : "We'll remind you 24 hours, 12 hours, 6 hours, 1 hour and 30 minutes before your sensor ends, so you can have a new one ready."}
          </Text>
          {notifSheet === "settings" ? (
            <Button
              title="Open Settings"
              onPress={() => {
                setNotifSheet(null);
                Linking.openSettings();
              }}
              testID="notification-open-settings-button"
            />
          ) : (
            <Button title="Allow notifications" onPress={requestNotifications} testID="notification-allow-button" />
          )}
          <Button title="Not now" kind="secondary" onPress={() => setNotifSheet(null)} testID="notification-not-now-button" />
        </View>
      </Modal>

      <Modal visible={!!permSheet} transparent animationType="slide" onRequestClose={() => setPermSheet(null)}>
        <Pressable style={styles.backdrop} onPress={() => setPermSheet(null)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} testID="location-permission-sheet">
          <Ionicons name="location" size={32} color={colors.brandPrimary} />
          <Text style={styles.sheetTitle}>Share your location in emergencies</Text>
          <Text style={styles.sheetBody}>
            {permSheet === "settings"
              ? "Location is turned off for this app. Turn it on in Settings so your contacts can find you during a severe low."
              : "If a severe low isn't snoozed, your contacts get a map link to where you are. It's only used for these messages."}
          </Text>
          {permSheet === "settings" ? (
            <Button
              title="Open Settings"
              onPress={() => {
                setPermSheet(null);
                Linking.openSettings();
              }}
              testID="location-open-settings-button"
            />
          ) : (
            <Button title="Allow location" onPress={requestLocation} testID="location-allow-button" />
          )}
          <Button title="Not now" kind="secondary" onPress={() => setPermSheet(null)} testID="location-not-now-button" />
        </View>
      </Modal>
    </DaySettingsContext.Provider>
  );
}
