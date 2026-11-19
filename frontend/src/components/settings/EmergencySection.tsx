import Ionicons from "@react-native-vector-icons/ionicons";
import type { UseMutationResult } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import type { ChannelSchedule, Settings } from "@/src/api";
import { TelnyxSheet } from "@/src/components/TelnyxSheet";
import { TwilioSheet } from "@/src/components/TwilioSheet";
import { Button, Card, Field, Hint, SectionTitle, ToggleRow } from "@/src/components/ui";
import { agoText } from "@/src/glucose";
import { isAndroid } from "@/src/phoneSms";
import { spacing, useTheme } from "@/src/theme";
import { SetSetting, useSettingsStyles } from "./styles";

type Log = { id: string; ts: string; test: boolean; results: string[] };

const TRIG_NAME: Record<string, string> = { urgent_low: "Urgent low", low: "Low", high: "High", urgent_high: "Urgent high", missed: "Lost connection" };
const channelText = (ch: ChannelSchedule, triggers: string[] = [], custom: Record<string, string> = {}) =>
  ch.enabled ? `for ${triggers.map((t) => TRIG_NAME[t] ?? custom[t] ?? "custom alarm").join(", ") || "no alarms"}` : "off";

export function EmergencySection({
  draft,
  set,
  setNum,
  ensureLocation,
  onEditContact,
  emTest,
  log,
}: {
  draft: Settings;
  set: SetSetting;
  setNum: (key: keyof Settings, text: string) => void;
  ensureLocation: () => void;
  onEditContact: (i: number) => void;
  emTest: UseMutationResult<any, Error, void, unknown>;
  log: Log[];
}) {
  const styles = useSettingsStyles();
  const customNames = Object.fromEntries((draft.glucose_alarms ?? []).map((g) => [`custom:${g.id}`, g.title]));
  const { colors } = useTheme();
  const [twilioOpen, setTwilioOpen] = useState(false);
  const [telnyxOpen, setTelnyxOpen] = useState(false);
  const hasTelnyx = !!(draft.telnyx_key_set && draft.telnyx_from);
  const hasTwilio = !!(draft.twilio_sid && draft.twilio_from && draft.twilio_token_set);
  const needsTwilio = !isAndroid || draft.em_contacts.some((c) => c.call.enabled);
  const twilioWhy = isAndroid
    ? "Texts go from this phone's own number. Voice calls (a voice reads the alert and location) need your own Telnyx or Twilio account."
    : "iPhone can't send texts or make calls by itself, so emergency texts and calls go through your own Telnyx or Twilio account.";

  return (
    <>
      <SectionTitle>Emergency messages</SectionTitle>
      <Card style={{ paddingVertical: spacing.xs }}>
        <ToggleRow
          label="Emergency messages"
          sub="Alert contacts when an alarm isn't snoozed in time"
          value={draft.em_enabled}
          onChange={(v) => {
            set("em_enabled", v);
            if (v && draft.em_location) ensureLocation();
            if (v && !isAndroid && !hasTwilio && !hasTelnyx) setTelnyxOpen(true);
          }}
          testID="emergency-enabled-toggle"
        />
        <Pressable testID="emergency-telnyx-row" onPress={() => setTelnyxOpen(true)} style={[styles.contactRow, styles.bottomBorder]}>
          <Ionicons name="call" size={22} color={hasTelnyx ? colors.brandPrimary : needsTwilio && !hasTwilio ? colors.warning : colors.muted} />
          <View style={{ flex: 1, paddingVertical: spacing.sm }}>
            <Text style={styles.radioTitle}>Telnyx account (usually cheaper)</Text>
            <Text style={styles.radioSub} testID="emergency-telnyx-status">
              {hasTelnyx
                ? `Connected · ${draft.telnyx_from}${draft.em_provider === "telnyx" ? " · in use" : ""}`
                : isAndroid
                  ? "Only needed for voice calls. Texts go from this phone."
                  : "Needed for emergency texts and calls on iPhone"}
            </Text>
          </View>
          <Text style={[styles.radioTitle, { color: colors.brandPrimary }]}>{hasTelnyx ? "Edit" : "Add"}</Text>
        </Pressable>
        <Pressable testID="emergency-twilio-row" onPress={() => setTwilioOpen(true)} style={[styles.contactRow, styles.bottomBorder]}>
          <Ionicons name="cloud" size={22} color={hasTwilio ? colors.brandPrimary : needsTwilio ? colors.warning : colors.muted} />
          <View style={{ flex: 1, paddingVertical: spacing.sm }}>
            <Text style={styles.radioTitle}>Twilio account</Text>
            <Text style={styles.radioSub} testID="emergency-twilio-status">
              {hasTwilio
                ? `Connected · ${draft.twilio_from}${draft.em_provider === "twilio" ? " · in use" : ""}`
                : isAndroid
                  ? "Only needed for voice calls. Texts go from this phone."
                  : "Needed for emergency texts and calls on iPhone"}
            </Text>
          </View>
          <Text style={[styles.radioTitle, { color: colors.brandPrimary }]}>{hasTwilio ? "Edit" : "Add"}</Text>
        </Pressable>
        <ToggleRow
          label="Include my location"
          sub="Adds a map link to the text"
          value={draft.em_location}
          onChange={(v) => {
            set("em_location", v);
            if (v) ensureLocation();
          }}
          testID="emergency-location-toggle"
          last
        />
      </Card>

      <Text style={styles.subTitle}>Contacts</Text>
      <Card style={{ paddingVertical: spacing.xs }}>
        {draft.em_contacts.length === 0 && (
          <Text style={[styles.radioSub, { paddingVertical: spacing.md }]}>No contacts yet. Each contact gets their own texts, calls, days and hours.</Text>
        )}
        {draft.em_contacts.map((c, i) => (
          <Pressable
            key={`${c.phone}-${i}`}
            onPress={() => onEditContact(i)}
            style={[styles.contactRow, i < draft.em_contacts.length - 1 && styles.bottomBorder]}
            testID={`emergency-contact-${i}`}
          >
            <Ionicons name="person-circle" size={28} color={colors.muted} />
            <View style={{ flex: 1, paddingVertical: spacing.sm }}>
              <Text style={styles.radioTitle}>{c.name}</Text>
              <Text style={styles.radioSub}>{c.phone}</Text>
              <Text style={styles.radioSub}>Text: {channelText(c.sms, c.sms_triggers, customNames)}</Text>
              <Text style={styles.radioSub}>Call: {channelText(c.call, c.call_triggers, customNames)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        ))}
      </Card>
      <Button title="Add contact" kind="secondary" onPress={() => onEditContact(-1)} testID="emergency-add-contact-button" style={{ marginTop: spacing.sm }} />
      <Button title="Send test message" kind="danger" onPress={() => emTest.mutate()} loading={emTest.isPending} testID="emergency-test-button" style={{ marginTop: spacing.sm }} />
      <Hint>
        Each contact has their own wait, repeat time and number of messages for every alarm, including your custom ones. Messages stop when you snooze or glucose returns to range. Messages
        aren&apos;t sent while the demo sensor is selected.{" "}
        {isAndroid
          ? "Texts go from this phone's number at your normal SMS rate; calls go through your own Telnyx or Twilio account."
          : "Texts and calls go through your own Telnyx or Twilio account, which charges per message."}
      </Hint>
      {twilioOpen && (
        <TwilioSheet
          visible
          settings={draft}
          why={twilioWhy}
          onClose={() => setTwilioOpen(false)}
          onSaved={(d) => {
            // keep the unsaved page draft in sync so the main Save doesn't send old empty values
            set("twilio_sid", d.twilio_sid);
            set("twilio_from", d.twilio_from);
            set("twilio_token_set", d.twilio_token_set);
            set("em_provider", d.em_provider);
          }}
        />
      )}
      {telnyxOpen && (
        <TelnyxSheet
          visible
          settings={draft}
          why={twilioWhy}
          onClose={() => setTelnyxOpen(false)}
          onSaved={(d) => {
            set("telnyx_from", d.telnyx_from);
            set("telnyx_app_id", d.telnyx_app_id);
            set("telnyx_key_set", d.telnyx_key_set);
            set("em_provider", d.em_provider);
          }}
        />
      )}
      {log.slice(0, 3).map((l) => (
        <Text key={l.id} style={styles.logLine} testID="emergency-log-line">
          {l.test ? "Test" : "Alert"} · {agoText(l.ts)} · {l.results.join(", ")}
        </Text>
      ))}
    </>
  );
}
