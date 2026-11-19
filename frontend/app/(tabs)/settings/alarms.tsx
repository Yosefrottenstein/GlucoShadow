import { format } from "date-fns";
import { ActivityIndicator, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, Settings } from "@/src/api";
import { AlarmActivity } from "@/src/components/AlarmActivity";
import { CategoryHeader } from "@/src/components/settings/CategoryHeader";
import { AlarmsSection, TimingFields } from "@/src/components/settings/AlarmsSection";
import { EmergencySection } from "@/src/components/settings/EmergencySection";
import { useSettingsStyles } from "@/src/components/settings/styles";
import { ChipRow } from "@/src/components/ChipRow";
import { ContactSheet } from "@/src/components/ContactSheet";
import { Sheet } from "@/src/components/Sheet";
import { ShabbatFrame } from "@/src/components/ShabbatFrame";
import { SoundPicker } from "@/src/components/SoundPicker";
import { StyleHours } from "@/src/components/StyleHours";
import { asTime } from "@/src/components/ScheduleEditor";
import { useToast } from "@/src/components/Toast";
import { Button, Card, Field, Hint, SectionTitle, ToggleRow } from "@/src/components/ui";
import { toDisplay, unitLabel } from "@/src/glucose";
import { useSettingsScreen } from "@/src/settingsStore";
import { spacing, useTheme } from "@/src/theme";
import { usesNativeTabs } from "@/src/navigation";

export default function AlarmsScreen() {
  const styles = useSettingsStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const {
    draft, set, setNum, setDraft, thr, setThr, qc,
    switchMode, ensureLocation, emTest, log,
    editing, setEditing, setSoundEdit,
    gaEdit, setGaEdit, saveGlucoseAlarm,
    reminderEdit, setReminderEdit, saveReminder,
  } = useSettingsScreen();
  const u = draft ? unitLabel(draft.unit) : "";

  if (!draft) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.brandPrimary} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <CategoryHeader title="Alarms" />
      <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: bottomChrome + 32 }} keyboardShouldPersistTaps="handled">
        <ShabbatFrame on={!!draft.shabbat_mode}>
          <SectionTitle>Shabbat mode</SectionTitle>
          <Card style={{ paddingVertical: spacing.xs }}>
            <ToggleRow
              label="Shabbat mode"
              sub={draft.shabbat_mode ? "On: Shabbat alarm and emergency message settings are in use" : "Off: standard settings are in use"}
              value={!!draft.shabbat_mode}
              onChange={switchMode}
              testID="shabbat-mode-toggle"
              last
            />
          </Card>
          <Hint>Alarms (levels, sounds, hours) and emergency messages (contacts, hours, calls) are kept separately for standard and Shabbat mode. Everything else is shared.</Hint>

          <AlarmsSection
            draft={draft}
            set={set}
            setNum={setNum}
            thr={thr}
            setThr={setThr}
            onSound={setSoundEdit}
            onEditGlucoseAlarm={(index, value) => setGaEdit({ index, value, text: index >= 0 ? toDisplay(value.value, draft.unit) : "" })}
            onEditReminder={(index, value) => setReminderEdit({ index, value })}
          />

          <EmergencySection
            draft={draft}
            set={set}
            setNum={setNum}
            ensureLocation={ensureLocation}
            onEditContact={setEditing}
            emTest={emTest}
            log={log.data ?? []}
          />
        </ShabbatFrame>
      </KeyboardAwareScrollView>

      <Sheet visible={!!gaEdit} onClose={() => setGaEdit(null)} title={gaEdit && gaEdit.index >= 0 ? "Edit glucose alarm" : "New glucose alarm"} testID="glucose-alarm-sheet">
        {gaEdit && (
          <>
            <Field
              label="Title"
              value={gaEdit.value.title}
              onChangeText={(v) => setGaEdit({ ...gaEdit, value: { ...gaEdit.value, title: v } })}
              placeholder="e.g. Dropping, eat something"
              autoCapitalize="sentences"
              testID="glucose-alarm-title-input"
            />
            <View style={[styles.alarmRow, styles.bottomBorder]}>
              <ChipRow
                options={[
                  { value: "below", label: "Below" },
                  { value: "above", label: "Above" },
                ]}
                value={gaEdit.value.direction}
                onChange={(v) => setGaEdit({ ...gaEdit, value: { ...gaEdit.value, direction: v } })}
                testIDPrefix="glucose-alarm-direction"
                padded={false}
              />
              <TextInput
                testID="glucose-alarm-value-input"
                value={gaEdit.text}
                onChangeText={(v) => setGaEdit({ ...gaEdit, text: v })}
                keyboardType="decimal-pad"
                style={styles.thrInput}
              />
              <Text style={styles.unitText}>{u}</Text>
            </View>
            <ToggleRow
              label="Alarm on"
              value={gaEdit.value.enabled}
              onChange={(v) => setGaEdit({ ...gaEdit, value: { ...gaEdit.value, enabled: v } })}
              testID="glucose-alarm-enabled-toggle"
              last
            />
            <SoundPicker value={gaEdit.value} onChange={(v) => setGaEdit({ ...gaEdit, value: { ...gaEdit.value, ...v } })} testIDPrefix="glucose-alarm-sound" />
            <TimingFields value={gaEdit.value} onChange={(v) => setGaEdit({ ...gaEdit, value: { ...gaEdit.value, ...v } })} testIDPrefix="glucose-alarm" />
            <AlarmActivity
              days={gaEdit.value.days ?? [0, 1, 2, 3, 4, 5, 6]}
              offWindows={gaEdit.value.off_windows ?? []}
              onChange={(v) => setGaEdit({ ...gaEdit, value: { ...gaEdit.value, ...v } })}
              testIDPrefix="glucose-alarm-active"
            />
            <StyleHours value={gaEdit.value.windows ?? []} onChange={(w) => setGaEdit({ ...gaEdit, value: { ...gaEdit.value, windows: w } })} testIDPrefix="glucose-alarm-hours" />
            <Button title="Save alarm" onPress={saveGlucoseAlarm} testID="glucose-alarm-save-button" style={{ marginTop: spacing.lg }} />
            {gaEdit.index >= 0 && (
              <Button
                title="Delete alarm"
                kind="secondary"
                onPress={() => {
                  set("glucose_alarms", draft.glucose_alarms.filter((_, j) => j !== gaEdit.index));
                  setGaEdit(null);
                }}
                testID="glucose-alarm-delete-button"
                style={{ marginTop: spacing.sm }}
              />
            )}
          </>
        )}
      </Sheet>

      <Sheet
        visible={!!reminderEdit}
        onClose={() => setReminderEdit(null)}
        title={reminderEdit && reminderEdit.index >= 0 ? "Edit reminder" : "New reminder"}
        testID="reminder-sheet"
      >
        {reminderEdit && (
          <>
            <Field
              label="Title"
              value={reminderEdit.value.title}
              onChangeText={(v) => setReminderEdit({ ...reminderEdit, value: { ...reminderEdit.value, title: v } })}
              placeholder="e.g. Site change"
              autoCapitalize="sentences"
              testID="reminder-title-input"
            />
            <Field
              label="Time"
              value={reminderEdit.value.time}
              onChangeText={(v) => setReminderEdit({ ...reminderEdit, value: { ...reminderEdit.value, time: asTime(v) } })}
              placeholder="HH:MM"
              keyboardType="number-pad"
              maxLength={5}
              testID="reminder-time-input"
            />
            <View style={styles.inlineChips}>
              <ChipRow
                options={[
                  { value: "daily", label: "Every day" },
                  { value: "once", label: "Once" },
                ]}
                value={reminderEdit.value.repeat}
                onChange={(v) =>
                  setReminderEdit({
                    ...reminderEdit,
                    value: { ...reminderEdit.value, repeat: v, date: v === "once" ? (reminderEdit.value.date ?? format(new Date(), "yyyy-MM-dd")) : null },
                  })
                }
                testIDPrefix="reminder-repeat"
                padded={false}
              />
            </View>
            {reminderEdit.value.repeat === "once" && (
              <Field
                label="Date"
                value={reminderEdit.value.date ?? ""}
                onChangeText={(v) => setReminderEdit({ ...reminderEdit, value: { ...reminderEdit.value, date: v } })}
                placeholder="YYYY-MM-DD"
                keyboardType="numbers-and-punctuation"
                testID="reminder-date-input"
              />
            )}
            <ToggleRow
              label="Reminder on"
              value={reminderEdit.value.enabled}
              onChange={(v) => setReminderEdit({ ...reminderEdit, value: { ...reminderEdit.value, enabled: v } })}
              testID="reminder-enabled-toggle"
              last
            />
            <SoundPicker
              value={reminderEdit.value}
              onChange={(v) => setReminderEdit({ ...reminderEdit, value: { ...reminderEdit.value, ...v } })}
              testIDPrefix="reminder-sound"
            />
            <Button title="Save reminder" onPress={saveReminder} testID="reminder-save-button" style={{ marginTop: spacing.lg }} />
            {reminderEdit.index >= 0 && (
              <Button
                title="Delete reminder"
                kind="secondary"
                onPress={() => {
                  set("reminders", draft.reminders.filter((_, j) => j !== reminderEdit.index));
                  setReminderEdit(null);
                }}
                testID="reminder-delete-button"
                style={{ marginTop: spacing.sm }}
              />
            )}
          </>
        )}
      </Sheet>

      <ContactSheet
        visible={editing !== null}
        contact={editing !== null && editing >= 0 ? draft.em_contacts[editing] : null}
        customAlarms={draft.glucose_alarms.map((g) => ({ id: g.id, title: g.title }))}
        legacyWait={draft.em_delay_minutes}
        onTest={async (c, channel) => {
          if (draft.em_contacts.some((x, j) => x.phone === c.phone && j !== editing)) throw new Error("This phone number is already a contact");
          const isNew = editing === null || editing < 0;
          const list = [...draft.em_contacts];
          if (isNew) list.push(c);
          else list[editing] = c;
          const data = await api<Settings>("/settings", { method: "PUT", body: { em_contacts: list } });
          qc.setQueryData(["settings"], data);
          setDraft((d) => (d ? { ...d, em_contacts: data.em_contacts } : d));
          if (isNew) setEditing(data.em_contacts.length - 1);
          const r = await api<{ results: string[] }>(`/emergency/test?phone=${encodeURIComponent(c.phone)}&channel=${channel}`, { method: "POST" });
          qc.invalidateQueries({ queryKey: ["emergency-log"] });
          return r.results.join(" · ") || "Nothing to send";
        }}
        onSave={(c) => {
          if (draft.em_contacts.some((x, j) => x.phone === c.phone && j !== editing)) return toast("This phone number is already a contact", "error");
          const list = [...draft.em_contacts];
          if (editing !== null && editing >= 0) list[editing] = c;
          else list.push(c);
          set("em_contacts", list);
          setEditing(null);
          toast("Contact updated. Tap Save to keep it.", "info");
        }}
        onDelete={
          editing !== null && editing >= 0
            ? () => {
                set("em_contacts", draft.em_contacts.filter((_, j) => j !== editing));
                setEditing(null);
              }
            : undefined
        }
        onClose={() => setEditing(null)}
      />
    </View>
  );
}
