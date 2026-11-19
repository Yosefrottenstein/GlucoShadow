import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Linking, Pressable, Text } from "react-native";

import { api, Settings } from "@/src/api";
import { fonts, makeStyles, spacing } from "@/src/theme";
import { Sheet } from "./Sheet";
import { useToast } from "./Toast";
import { Button, Field } from "./ui";

/** The user's own Telnyx account (usually cheaper than Twilio): emergency texts and voice calls. */
export function TelnyxSheet({
  visible,
  settings,
  onClose,
  onSaved,
  why,
}: {
  visible: boolean;
  settings: Settings;
  onClose: () => void;
  onSaved: (s: Settings) => void;
  why: string;
}) {
  const styles = useStyles();
  const toast = useToast();
  const qc = useQueryClient();
  const [key, setKey] = useState("");
  const [from, setFrom] = useState(settings.telnyx_from);
  const [appId, setAppId] = useState(settings.telnyx_app_id);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);

  const disconnect = async () => {
    setRemoving(true);
    try {
      const data = await api<Settings>("/telnyx", { method: "DELETE" });
      qc.setQueryData(["settings"], data);
      onSaved(data);
      toast("Telnyx account removed", "success");
      onClose();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setRemoving(false);
    }
  };

  const save = async () => {
    const f = from.replace(/[\s()-]/g, "");
    const a = appId.trim();
    if (!key.trim() && !settings.telnyx_key_set) return toast("Enter your Telnyx API key", "error");
    if (!/^\+\d{7,15}$/.test(f)) return toast("Telnyx number must start with + and country code", "error");
    if (!/^[0-9A-Za-z_-]{0,64}$/.test(a)) return toast("Application ID has invalid characters", "error");
    setBusy(true);
    try {
      const data = await api<Settings>("/settings", {
        method: "PUT",
        body: { telnyx_key: key.trim(), telnyx_from: f, telnyx_app_id: a, em_provider: "telnyx" },
      });
      qc.setQueryData(["settings"], data);
      onSaved(data);
      toast("Telnyx account saved", "success");
      onClose();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Your Telnyx account" testID="telnyx-sheet">
      <Text style={styles.body}>{why}</Text>
      <Text style={styles.body}>
        In the Telnyx portal: create an API key, buy a phone number, and assign it to a messaging profile. For voice calls also create a
        TeXML application and assign the number to it. Telnyx charges your account per text and call. In the US, texts to other carriers
        also need Telnyx&apos;s 10DLC or toll-free registration first.
      </Text>
      <Pressable onPress={() => Linking.openURL("https://portal.telnyx.com")} testID="telnyx-portal-link" style={styles.link}>
        <Text style={styles.linkText}>Open Telnyx portal</Text>
      </Pressable>
      <Field
        label="API key"
        value={key}
        onChangeText={setKey}
        placeholder={settings.telnyx_key_set ? "Saved · type to replace" : "API key"}
        autoCapitalize="none"
        secureTextEntry
        testID="telnyx-key-input"
      />
      <Field label="Telnyx number" value={from} onChangeText={setFrom} placeholder="+15551234567" keyboardType="phone-pad" testID="telnyx-from-input" />
      <Field label="TeXML application ID (for calls)" value={appId} onChangeText={setAppId} placeholder="Optional, only for voice calls" autoCapitalize="none" testID="telnyx-app-input" last />
      <Button title="Save Telnyx account" onPress={save} loading={busy} testID="telnyx-save-button" style={{ marginTop: spacing.lg }} />
      {(settings.telnyx_from || settings.telnyx_key_set) && (
        <Button title="Disconnect Telnyx account" kind="danger" onPress={disconnect} loading={removing} testID="telnyx-disconnect-button" style={{ marginTop: spacing.sm }} />
      )}
    </Sheet>
  );
}

const useStyles = makeStyles((c) => ({
  body: { fontFamily: fonts.text, fontSize: 14, lineHeight: 20, color: c.onSurfaceTertiary, marginBottom: spacing.sm },
  link: { minHeight: 44, justifyContent: "center" },
  linkText: { fontFamily: fonts.text, fontSize: 14, fontWeight: "700", color: c.brandPrimary },
}));
