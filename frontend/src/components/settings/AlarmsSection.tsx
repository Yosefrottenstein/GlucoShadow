import Ionicons from "@react-native-vector-icons/ionicons";
import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { alarmState, type AlarmState } from "@/src/alarmActive";

import type { GlucoseAlarm, Reminder, Settings } from "@/src/api";
import { Button, Card, Field, Hint, SectionTitle } from "@/src/components/ui";
import { toDisplay, unitLabel } from "@/src/glucose";
import { useT } from "@/src/i18n";
import { SOUNDS, styleNow } from "@/src/sounds";
import { spacing, useTheme } from "@/src/theme";
import { SetSetting, useSettingsStyles } from "./styles";

export type AlarmKey = "urgent_low" | "low" | "high" | "urgent_high";
export type ThrKey = AlarmKey | "target_low" | "target_high" | "tight_low" | "tight_high";
export const THR: { key: AlarmKey; label: string }[] = [
  { key: "urgent_low", label: "Urgent low" },
  { key: "low", label: "Low" },
  { key: "high", label: "High" },
  { key: "urgent_high", label: "Urgent high" },
];
export const TARGET: { key: ThrKey; label: string }[] = [
  { key: "target_low", label: "Target low" },
  { key: "target_high", label: "Target high" },
  { key: "tight_low", label: "Tight low" },
  { key: "tight_high", label: "Tight high" },
];
/** What this alarm does right now: its style at this hour (hours settings applied), e.g. "Now: Chime + vibrate". */
export const nowText = (a: { style: string; sound: string; windows?: any[] }, at: Date = new Date()) =>
  `Now: ${soundText({ style: styleNow(a as any, at), sound: a.sound })}`;
export const soundText = (a: { style: string; sound: string }) =>
  a.style === "vibrate" ? "Vibrate only" : `${SOUNDS.find((s) => s.id === a.sound)?.label ?? a.sound}${a.style === "both" ? " + vibrate" : ""}`;

/** Target + tight range editor, used in the "Glucose & ranges" settings category. */
export function TargetRangeSection({ draft, thr, setThr }: { draft: Settings; thr: Record<ThrKey, string>; setThr: (k: ThrKey, v: string) => void }) {
  const styles = useSettingsStyles();
  const { colors } = useTheme();
  const tr = useT();
  const u = unitLabel(draft.unit);
  return (
    <>
      <SectionTitle>{tr("Target range")}</SectionTitle>
      <Card style={{ paddingVertical: spacing.xs }}>
        {TARGET.map((t, i) => (
          <View key={t.key} style={[styles.alarmRow, i < TARGET.length - 1 && styles.bottomBorder]}>
            <View style={[styles.swatch, { backgroundColor: t.key === "target_low" ? colors.low : t.key === "target_high" ? colors.high : colors.inRange }]} />
            <Text style={[styles.radioTitle, { flex: 1 }]}>{t.label}</Text>
            <TextInput testID={`target-${t.key}`} value={thr[t.key]} onChangeText={(v) => setThr(t.key, v)} keyboardType="decimal-pad" style={styles.thrInput} />
            <Text style={styles.unitText}>{u}</Text>
          </View>
        ))}
      </Card>
      <View style={styles.legendRow}>
        {[
          { c: colors.low, l: "Below range" },
          { c: colors.inRange, l: "In range" },
          { c: colors.high, l: "Above range" },
        ].map((x) => (
          <View key={x.l} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: x.c }]} />
            <Text style={styles.radioSub}>{x.l}</Text>
          </View>
        ))}
      </View>
      <Hint>
        Colours the graph dots and sets time in range. The tight range must stay inside the target range: dots inside it are joined by a line on the
        graph, and it has its own time in tight range. Alarm levels below are separate.
      </Hint>
    </>
  );
}

export function AlarmsSection({
  draft,
  set,
  setNum,
  thr,
  setThr,
  onSound,
  onEditGlucoseAlarm,
  onEditReminder,
}: {
  draft: Settings;
  set: SetSetting;
  setNum: (key: keyof Settings, text: string) => void;
  thr: Record<ThrKey, string>;
  setThr: (k: ThrKey, v: string) => void;
  onSound: (key: string) => void;
  onEditGlucoseAlarm: (index: number, value: GlucoseAlarm) => void;
  onEditReminder: (index: number, value: Reminder) => void;
}) {
  const styles = useSettingsStyles();
  const { colors } = useTheme();
  const u = unitLabel(draft.unit);
  // the greyed-out state follows the clock, so it is always what is true right now
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <SectionTitle>Alarms</SectionTitle>
      <Card style={{ paddingVertical: spacing.xs }}>
        <AlarmRow
          title="Urgent low"
          sub={`${toDisplay(50, draft.unit)} ${u} · Now: ${soundText(draft.alarm_sounds.extreme_low)}`}
          state={{ active: true, text: "" }}
          onEdit={() => onSound("extreme_low")}
          testID="alarm-extreme_low"
        />
        {THR.filter((t) => t.key !== "urgent_low").map((t) => {
          const cfg = draft.alarm_sounds[t.key];
          const st = alarmState(cfg, draft[`alarm_${t.key}` as keyof Settings] as boolean, now);
          return (
            <AlarmRow
              key={t.key}
              title={t.label}
              sub={`${t.key === "low" ? "Below" : "Above"} ${toDisplay(draft[t.key], draft.unit)} ${u} · ${nowText(cfg, now)}`}
              state={st}
              onEdit={() => onSound(t.key)}
              testID={`alarm-${t.key}`}
            />
          );
        })}
        <AlarmRow
          title="Lost connection"
          sub={`After ${draft.missed_minutes} min without a reading · ${nowText(draft.alarm_sounds.missed, now)}`}
          state={alarmState(draft.alarm_sounds.missed, draft.alarm_missed, now)}
          onEdit={() => onSound("missed")}
          testID="alarm-missed"
          last
        />
      </Card>
      <Hint>
        Tap the pencil to change an alarm: its value, the days and hours it is on, its sound and vibration, how often it repeats and how long Snooze lasts. Urgent low ({toDisplay(50, draft.unit)} {u}) is preset: it is always on and always plays sound only. Alarms ring while the app is open or woken by the sensor; emergency messages
        are sent even when the phone is locked.
      </Hint>

      <Text style={styles.subTitle}>Custom glucose alarms</Text>
      <Card style={{ paddingVertical: spacing.xs }}>
        {draft.glucose_alarms.length === 0 && <Text style={[styles.radioSub, { paddingVertical: spacing.md }]}>Add your own alarm for any number, above or below.</Text>}
        {draft.glucose_alarms.map((g, i) => {
          const st = alarmState(g, g.enabled, now);
          return (
            <AlarmRow
              key={g.id}
              title={g.title}
              sub={`${g.direction === "below" ? "Below" : "Above"} ${toDisplay(g.value, draft.unit)} ${u} · ${nowText(g, now)} · every ${g.repeat_minutes} min`}
              state={st}
              onEdit={() => onEditGlucoseAlarm(i, g)}
              testID={`glucose-alarm-row-${i}`}
              last={i === draft.glucose_alarms.length - 1}
            />
          );
        })}
      </Card>
      <Button
        title="Add glucose alarm"
        kind="secondary"
        onPress={() =>
          onEditGlucoseAlarm(-1, { id: `${Date.now()}`, title: "", direction: "below", value: 80, enabled: true, style: "both", sound: "classic", repeat_minutes: 5, snooze_minutes: 30 })
        }
        testID="glucose-alarm-add-button"
        style={{ marginTop: spacing.sm }}
      />

      <SectionTitle>Reminders</SectionTitle>
      <Card style={{ paddingVertical: spacing.xs }}>
        {draft.reminders.length === 0 && <Text style={[styles.radioSub, { paddingVertical: spacing.md }]}>No reminders yet. Add one for site change, insulin, meals…</Text>}
        {draft.reminders.map((r, i) => (
          <Pressable key={r.id} testID={`reminder-row-${i}`} onPress={() => onEditReminder(i, r)} style={[styles.contactRow, i < draft.reminders.length - 1 && styles.bottomBorder]}>
            <Ionicons name="alarm" size={24} color={r.enabled ? colors.brandPrimary : colors.muted} />
            <View style={{ flex: 1 }}>
              <Text style={styles.radioTitle}>{r.title}</Text>
              <Text style={styles.radioSub}>
                {r.repeat === "daily" ? "Every day" : r.date} at {r.time} · {soundText(r)}
                {r.enabled ? "" : " · off"}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        ))}
      </Card>
      <Button
        title="Add reminder"
        kind="secondary"
        onPress={() => onEditReminder(-1, { id: `${Date.now()}`, title: "", time: "08:00", repeat: "daily", date: null, enabled: true, style: "both", sound: "chime" })}
        testID="reminder-add-button"
        style={{ marginTop: spacing.sm }}
      />
    </>
  );
}

export function TimingFields({
  value,
  onChange,
  testIDPrefix,
}: {
  value: { repeat_minutes?: number; snooze_minutes?: number };
  onChange: (v: { repeat_minutes?: number; snooze_minutes?: number }) => void;
  testIDPrefix: string;
}) {
  const num = (t: string) => Math.min(720, parseInt(t.replace(/\D/g, ""), 10) || 0);
  return (
    <View style={{ marginTop: spacing.md }}>
      <Field label="Repeat every" value={String(value.repeat_minutes ?? 1)} onChangeText={(t) => onChange({ repeat_minutes: num(t) })} keyboardType="number-pad" suffix="min" testID={`${testIDPrefix}-repeat-input`} />
      <Field
        label="Snooze for"
        value={String(value.snooze_minutes ?? 30)}
        onChangeText={(t) => onChange({ snooze_minutes: num(t) })}
        keyboardType="number-pad"
        suffix="min"
        testID={`${testIDPrefix}-snooze-input`}
        last
      />
    </View>
  );
}

/** One alarm in the list: nothing is typed here. Greyed out while the alarm is inactive; the pencil always stays on. */
function AlarmRow({ title, sub, state, onEdit, testID, last }: { title: string; sub: string; state: AlarmState; onEdit: () => void; testID: string; last?: boolean }) {
  const styles = useSettingsStyles();
  const { colors } = useTheme();
  return (
    <View style={[styles.alarmRow, !last && styles.bottomBorder]} testID={testID}>
      <View style={{ flex: 1, opacity: state.active ? 1 : 0.45 }}>
        <Text style={styles.radioTitle}>{title}</Text>
        <Text style={styles.radioSub}>{sub}</Text>
        {!state.active && (
          <Text style={[styles.radioSub, { fontWeight: "700", marginTop: 2 }]} testID={`${testID}-inactive`}>
            {state.text} To change the settings, tap the pencil.
          </Text>
        )}
      </View>
      <Pressable testID={`${testID}-edit`} onPress={onEdit} hitSlop={8} accessibilityLabel={`Edit ${title}`} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name="pencil" size={20} color={colors.brandPrimary} />
      </Pressable>
    </View>
  );
}
