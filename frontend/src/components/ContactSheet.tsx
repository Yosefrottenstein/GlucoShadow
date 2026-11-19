import Ionicons from "@react-native-vector-icons/ionicons";
import { Contact as PhoneContact } from "expo-contacts";
import { useContext, useEffect, useState } from "react";
import { Linking, Modal, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { ChannelSchedule, Contact, EmRule, EmTrigger } from "@/src/api";
import { isAndroid, phoneSmsSupported, requestSmsPermission, smsPermission } from "@/src/phoneSms";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { DAY_ORDER, DaySettingsContext, ScheduleEditor } from "./ScheduleEditor";
import { useToast } from "./Toast";
import { Button, Field, ToggleRow } from "./ui";

// day numbers (0=Mon..6=Sun) are unchanged in storage; only the on-screen order is Sunday first
const DAY_SHORT = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_NAME = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

const channel = (enabled: boolean): ChannelSchedule => ({ enabled, mode: "always", windows: [], repeat_minutes: 5 });
const SMS_VIA: Contact["sms_via"] = isAndroid ? "phone" : "cloud"; // Android texts from its own number, iPhone via Twilio
const TRIGGERS: { value: EmTrigger; label: string }[] = [
  { value: "urgent_low", label: "Urgent low" },
  { value: "low", label: "Low" },
  { value: "high", label: "High" },
  { value: "urgent_high", label: "Urgent high" },
  { value: "missed", label: "Lost connection" },
];
const NUM = (t: string, max: number) => Math.min(max, parseInt(t.replace(/\D/g, ""), 10) || 0);

/** One row per alarm (presets and your own): tick it, then set the wait, the resend time and how many messages. */
function AlarmRules({
  prefix,
  verb,
  ch,
  triggers,
  options,
  legacyWait,
  onChange,
}: {
  prefix: string;
  verb: string;
  ch: ChannelSchedule;
  triggers: EmTrigger[];
  options: { value: EmTrigger; label: string }[];
  legacyWait: number;
  onChange: (triggers: EmTrigger[], ch: ChannelSchedule) => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const perDay = useContext(DaySettingsContext);
  const ruleOf = (k: EmTrigger): EmRule => ({
    wait_minutes: k === "urgent_low" ? 0 : legacyWait,
    repeat_minutes: ch.repeat_minutes || 5,
    times: 0,
    days: ALL_DAYS,
    // alarms saved before this had one set of hours for the whole channel
    mode: ch.mode === "hours" ? "hours" : "always",
    windows: ch.mode === "hours" ? ch.windows : [],
    ...(ch.rules?.[k] ?? {}),
  });
  // each alarm now has its own days and hours, so the channel-wide hours are cleared once every ticked alarm holds its own copy
  const commit = (next: EmTrigger[], rules: Record<string, EmRule>): void =>
    onChange(next, { ...ch, mode: "always", windows: [], rules });
  const allRules = (): Record<string, EmRule> => ({ ...Object.fromEntries(triggers.map((t) => [t, ruleOf(t)])), ...(ch.rules ?? {}) });
  const setRule = (k: EmTrigger, patch: Partial<EmRule>) =>
    commit(triggers, { ...allRules(), [k]: { ...ruleOf(k), ...patch, ...(k === "urgent_low" ? { wait_minutes: 0 } : {}) } });
  const toggle = (k: EmTrigger) =>
    triggers.includes(k) ? commit(triggers.filter((t) => t !== k), allRules()) : commit([...triggers, k], { ...allRules(), [k]: ruleOf(k) });
  return (
    <View>
      {options.map((o) => {
        const on = triggers.includes(o.value);
        const r = ruleOf(o.value);
        return (
          <View key={o.value} style={styles.ruleBox}>
            <Pressable
              testID={`${prefix}-${o.value}`}
              onPress={() => toggle(o.value)}
              style={styles.ruleHead}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
            >
              <Ionicons name={on ? "checkbox" : "square-outline"} size={24} color={on ? colors.brandPrimary : colors.muted} />
              <Text style={styles.ruleTitle}>{o.label}</Text>
            </Pressable>
            {on && (
              <View style={styles.ruleBody}>
                {perDay && (
                  <>
                    <Text style={styles.label}>Days this message is on</Text>
                    <View style={styles.daysRow}>
                      {DAY_ORDER.map((d) => {
                        const dayOn = r.days.includes(d);
                        return (
                          <Pressable
                            key={d}
                            testID={`${prefix}-${o.value}-day-${d}`}
                            accessibilityLabel={DAY_NAME[d]}
                            onPress={() => setRule(o.value, { days: dayOn ? r.days.filter((x) => x !== d) : [...r.days, d].sort() })}
                            style={[styles.day, dayOn && styles.dayOn]}
                          >
                            <Text style={[styles.dayText, dayOn && styles.dayTextOn]}>{DAY_SHORT[d]}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <Text style={styles.radioSub}>
                      {r.days.length === 0
                        ? "All days are off: this message stays off until you switch a day on."
                        : "A day that is off keeps this message off for the whole day."}
                    </Text>
                  </>
                )}
                <Text style={styles.label}>When to {verb.toLowerCase()} for this alarm</Text>
                <ScheduleEditor
                  value={{ enabled: true, repeat_minutes: r.repeat_minutes, mode: r.mode, windows: r.windows }}
                  onChange={(v) => setRule(o.value, { mode: v.mode === "hours" ? "hours" : "always", windows: v.windows })}
                  testIDPrefix={`${prefix}-${o.value}-when`}
                />
                {o.value === "urgent_low" ? (
                  <Text style={styles.radioSub}>Sent right away. An urgent low is never held back.</Text>
                ) : (
                  <Field
                    label="Wait before the first one"
                    value={String(r.wait_minutes)}
                    onChangeText={(t) => setRule(o.value, { wait_minutes: NUM(t, 240) })}
                    keyboardType="number-pad"
                    suffix="min"
                    testID={`${prefix}-${o.value}-wait`}
                  />
                )}
                <Field
                  label={`${verb} again every`}
                  value={String(r.repeat_minutes)}
                  onChangeText={(t) => setRule(o.value, { repeat_minutes: Math.max(1, NUM(t, 720)) })}
                  keyboardType="number-pad"
                  suffix="min"
                  testID={`${prefix}-${o.value}-repeat`}
                />
                <Field
                  label="Send at most"
                  value={String(r.times)}
                  onChangeText={(t) => setRule(o.value, { times: NUM(t, 50) })}
                  keyboardType="number-pad"
                  suffix="times"
                  testID={`${prefix}-${o.value}-times`}
                  last
                />
                <Text style={styles.radioSub}>{r.times === 0 ? "0 = keep going until the alarm ends or you snooze." : `Stops after ${r.times} ${r.times === 1 ? "message" : "messages"}.`}</Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const fresh = (): Contact => ({ name: "", phone: "", sms: channel(true), call: channel(false), sms_via: SMS_VIA, sms_triggers: ["urgent_low"], call_triggers: ["urgent_low"] });
// older saves may still say "default"; show them as "any time"
const clean = (s: ChannelSchedule): ChannelSchedule => ({ ...channel(s.enabled), ...s, mode: s.mode === "hours" ? "hours" : "always" });

export function ContactSheet({
  visible,
  contact,
  customAlarms = [],
  legacyWait = 0,
  onSave,
  onTest,
  onDelete,
  onClose,
}: {
  visible: boolean;
  contact: Contact | null;
  customAlarms?: { id: string; title: string }[];
  legacyWait?: number;
  onSave: (c: Contact) => void;
  onTest: (c: Contact, channel: "sms" | "call") => Promise<string>;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [c, setC] = useState<Contact>(fresh());
  const options: { value: EmTrigger; label: string }[] = [
    ...TRIGGERS,
    ...customAlarms.map((g) => ({ value: `custom:${g.id}` as EmTrigger, label: g.title })),
  ];
  const [smsPerm, setSmsPerm] = useState<null | "ask" | "settings">(null);
  const [testing, setTesting] = useState<null | "sms" | "call">(null);

  const runTest = async (channel: "sms" | "call") => {
    const phone = c.phone.replace(/[\s()-]/g, "");
    if (!c.name.trim() || !/^\+\d{7,15}$/.test(phone)) return toast("Enter a nickname and a phone with country code first", "error");
    setTesting(channel);
    try {
      toast(await onTest({ ...c, name: c.name.trim(), phone }, channel), "info");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setTesting(null);
    }
  };

  useEffect(() => {
    if (!visible) return;
    const base = contact ? { ...fresh(), ...contact, sms_via: isAndroid ? SMS_VIA : contact.sms_via } : fresh();
    setC({ ...base, sms: clean(base.sms), call: clean(base.call) });
    setSmsPerm(null);
    if (isAndroid && phoneSmsSupported) smsPermission().then((ok) => !ok && base.sms.enabled && setSmsPerm("ask"));
  }, [visible, contact]);

  const pickFromPhone = async () => {
    try {
      const picked = await PhoneContact.presentPicker();
      if (!picked) return;
      const name = (await picked.getFullName().catch(() => "")) || c.name;
      const phones = await picked.getPhones().catch(() => []);
      const phone = (phones[0]?.number ?? "").replace(/[^\d+]/g, "").replace(/^00/, "+");
      setC((x) => ({ ...x, name, phone }));
      if (phone && !phone.startsWith("+")) toast("Add the country code at the start, e.g. +1", "info");
    } catch {
      toast("Couldn't open your contacts. Type the details instead.", "error");
    }
  };

  const askSms = async () => setSmsPerm((await requestSmsPermission()) === "granted" ? null : "settings");

  const save = () => {
    const phone = c.phone.replace(/[\s()-]/g, "");
    if (!c.name.trim()) return toast("Enter a nickname", "error");
    if (!/^\+\d{7,15}$/.test(phone)) return toast("Phone must start with + and country code, e.g. +15551234567", "error");
    if (c.sms.enabled && !c.sms_triggers.length) return toast("Pick at least one alarm for texts", "error");
    if (c.call.enabled && !c.call_triggers.length) return toast("Pick at least one alarm for calls", "error");
    onSave({ ...c, name: c.name.trim(), phone });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} testID="contact-sheet-backdrop" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.kav} pointerEvents="box-none">
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} testID="contact-sheet">
          <View style={styles.handle} />
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={styles.title}>{contact ? "Edit contact" : "Add contact"}</Text>
            {Platform.OS !== "web" && (
              <Pressable testID="contact-pick-from-phone" onPress={pickFromPhone} style={styles.pick}>
                <Ionicons name="people" size={18} color={colors.onBrandTertiary} />
                <Text style={styles.pickText}>Pick from phone contacts</Text>
              </Pressable>
            )}
            <Field label="Nickname" value={c.name} onChangeText={(v) => setC({ ...c, name: v })} placeholder="e.g. Mom" autoCapitalize="words" testID="contact-name-input" />
            <Field label="Phone" value={c.phone} onChangeText={(v) => setC({ ...c, phone: v })} placeholder="+15551234567" keyboardType="phone-pad" testID="contact-phone-input" last />

            <Text style={styles.section}>Text messages</Text>
            <ToggleRow label="Send texts to this contact" value={c.sms.enabled} onChange={(v) => setC({ ...c, sms: { ...c.sms, enabled: v } })} testID="contact-sms-toggle" last={!c.sms.enabled} />
            {c.sms.enabled && (
              <>
                <Text style={styles.radioSub}>
                  {isAndroid
                    ? "Sent from this phone's own number (needs signal and GlucoShadow running)."
                    : "Sent through your own Telnyx or Twilio account (iPhone can't text by itself)."}
                </Text>
                {smsPerm && (
                  <View style={styles.permBox} testID="contact-sms-permission">
                    <Text style={styles.radioSub}>
                      {smsPerm === "settings"
                        ? "SMS permission is off for this app. Turn it on in Settings so emergency texts can go out from your SIM card."
                        : "If a severe low isn't snoozed, the app texts this contact straight from your phone, even while you can't."}
                    </Text>
                    <Button
                      title={smsPerm === "settings" ? "Open Settings" : "Allow sending texts"}
                      onPress={smsPerm === "settings" ? () => Linking.openSettings() : askSms}
                      testID="contact-sms-permission-button"
                      style={{ marginTop: spacing.sm }}
                    />
                  </View>
                )}
                {isAndroid && !phoneSmsSupported && (
                  <Text style={styles.radioSub}>Texts from the SIM card work in the installed Android app, not in Expo Go.</Text>
                )}
                <Text style={styles.label}>Text for these alarms (tick an alarm to set its days, hours and timing)</Text>
                <AlarmRules prefix="contact-sms-trigger" verb="Text" ch={c.sms} triggers={c.sms_triggers} options={options} legacyWait={legacyWait} onChange={(t, ch) => setC({ ...c, sms_triggers: t, sms: ch })} />
                <Button title="Send test text" kind="secondary" onPress={() => runTest("sms")} loading={testing === "sms"} testID="contact-test-sms-button" style={{ marginTop: spacing.sm }} />
              </>
            )}

            <Text style={styles.section}>Voice calls</Text>
            <ToggleRow
              label="Call this contact"
              sub="A voice reads the alert and location aloud (your Telnyx or Twilio account)"
              value={c.call.enabled}
              onChange={(v) => setC({ ...c, call: { ...c.call, enabled: v } })}
              testID="contact-call-toggle"
              last={!c.call.enabled}
            />
            {c.call.enabled && (
              <>
                <Text style={styles.label}>Call for these alarms (tick an alarm to set its days, hours and timing)</Text>
                <AlarmRules prefix="contact-call-trigger" verb="Call" ch={c.call} triggers={c.call_triggers} options={options} legacyWait={legacyWait} onChange={(t, ch) => setC({ ...c, call_triggers: t, call: ch })} />
                <Button title="Make test call" kind="secondary" onPress={() => runTest("call")} loading={testing === "call"} testID="contact-test-call-button" style={{ marginTop: spacing.sm }} />
              </>
            )}

            <Button
              title="Send test message"
              kind="danger"
              onPress={async () => {
                if (!c.sms.enabled && !c.call.enabled) return toast("Turn on texts or calls for this contact first", "error");
                if (c.sms.enabled) await runTest("sms");
                if (c.call.enabled) await runTest("call");
              }}
              loading={testing !== null}
              testID="contact-test-all-button"
              style={{ marginTop: spacing.lg }}
            />
            <Button title="Save contact" onPress={save} testID="contact-save-button" style={{ marginTop: spacing.sm }} />
            {onDelete && <Button title="Remove contact" kind="secondary" onPress={onDelete} testID="contact-delete-button" style={{ marginTop: spacing.sm }} />}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  backdrop: { ...({ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as const), backgroundColor: c.scrim },
  kav: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: c.surfaceSecondary,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    maxHeight: "92%",
  },
  handle: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: c.borderStrong, marginBottom: spacing.md },
  title: { fontFamily: fonts.display, fontSize: 22, fontWeight: "700", color: c.onSurface, marginBottom: spacing.sm },
  pick: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: c.brandTertiary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    minHeight: 44,
    marginBottom: spacing.sm,
  },
  pickText: { fontFamily: fonts.text, fontSize: 14, fontWeight: "700", color: c.onBrandTertiary },
  section: {
    fontFamily: fonts.text,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    color: c.muted,
    marginTop: spacing.xl,
    textTransform: "uppercase",
  },
  label: { fontFamily: fonts.text, fontSize: 13, color: c.muted, marginTop: spacing.md, marginBottom: spacing.xs },
  viaBox: { backgroundColor: c.surface, borderRadius: radius.md, paddingHorizontal: spacing.md, marginTop: spacing.sm },
  radioRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm, minHeight: 48 },
  radioTitle: { fontFamily: fonts.text, fontSize: 15, fontWeight: "600", color: c.onSurface },
  radioSub: { fontFamily: fonts.text, fontSize: 12, color: c.muted, marginTop: 2 },
  ruleBox: { backgroundColor: c.surface, borderRadius: radius.md, paddingHorizontal: spacing.md, marginTop: spacing.sm },
  ruleHead: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 48 },
  ruleTitle: { flex: 1, fontFamily: fonts.text, fontSize: 15, fontWeight: "600", color: c.onSurface },
  ruleBody: { paddingBottom: spacing.sm },
  permBox: { backgroundColor: c.surface, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm },
  daysRow: { flexDirection: "row", gap: spacing.xs, marginTop: spacing.sm },
  day: { flex: 1, height: 40, borderRadius: 20, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.divider },
  dayOn: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  dayText: { fontFamily: fonts.text, fontSize: 14, fontWeight: "700", color: c.muted },
  dayTextOn: { color: c.onBrandPrimary },
}));
