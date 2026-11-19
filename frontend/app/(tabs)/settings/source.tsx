import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SensorType } from "@/src/api";
import { CategoryHeader } from "@/src/components/settings/CategoryHeader";
import { CloudFollowerFields } from "@/src/components/settings/CloudFollowerFields";
import { CompanionCard } from "@/src/components/settings/CompanionCard";
import { DexcomLoginFields } from "@/src/components/settings/UploadsSection";
import { G7PairingCard } from "@/src/components/settings/G7PairingCard";
import { useSettingsStyles } from "@/src/components/settings/styles";
import { ChipRow } from "@/src/components/ChipRow";
import { Button, Card, Field, Hint } from "@/src/components/ui";
import { SENSORS } from "@/src/ble";
import { agoText } from "@/src/glucose";
import { healthPlatform, enableHealthRead } from "@/src/health";
import { scanNow } from "@/src/g7";
import { isAndroid } from "@/src/phoneSms";
import { useToast } from "@/src/components/Toast";
import { FOLLOWER_SOURCES, MASTER_SOURCES, isFollowerSource, useSettingsScreen } from "@/src/settingsStore";
import { spacing, useTheme } from "@/src/theme";
import { usesNativeTabs } from "@/src/navigation";

const SENSOR_OPTIONS = (Object.keys(SENSORS) as SensorType[]).map((k) => ({ value: k, label: SENSORS[k].label }));

export default function DataSourceScreen() {
  const styles = useSettingsStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const toast = useToast();
  const router = useRouter();
  const { draft, set, setNum, secrets, setSecret, secretPh, status, save, dirty, setDirty, qc, scanLeft, syncNow, settings } = useSettingsScreen();

  if (!draft) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.brandPrimary} />
      </View>
    );
  }

  const FOLLOWER = FOLLOWER_SOURCES(isAndroid, healthPlatform);
  const MASTER = MASTER_SOURCES(healthPlatform);
  const mode = isFollowerSource(draft.source, FOLLOWER) ? "follower" : "master";
  const sensorLocked = !!settings.data?.sensor_started_at;

  return (
    <View style={styles.root}>
      <CategoryHeader title="Data source" />
      <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: bottomChrome + 32 }} keyboardShouldPersistTaps="handled">
        <ChipRow
          options={[
            { value: "follower", label: "Follower" },
            { value: "master", label: "Master" },
          ]}
          value={mode}
          onChange={(m) => m !== mode && set("source", m === "follower" ? "dexcom" : "bluetooth")}
          testIDPrefix="settings-mode"
          padded={false}
        />
        <Hint>
          {mode === "follower"
            ? "Follower: reads your glucose from a cloud service or from another glucose app on this phone."
            : "Master: this phone gets readings itself and uploads them to Nightscout, Tidepool and Dexcom Share."}
        </Hint>
        <Card style={{ paddingVertical: spacing.xs, marginTop: spacing.sm }}>
          {(mode === "follower" ? FOLLOWER : MASTER).map((s, i) => (
            <Pressable
              key={s.value}
              testID={`settings-source-${s.value}`}
              onPress={() => set("source", s.value)}
              style={[styles.radioRow, i > 0 && styles.topBorder]}
            >
              <Ionicons
                name={draft.source === s.value ? "radio-button-on" : "radio-button-off"}
                size={22}
                color={draft.source === s.value ? colors.brandPrimary : colors.borderStrong}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.radioTitle}>{s.title}</Text>
                <Text style={styles.radioSub}>{s.sub}</Text>
              </View>
            </Pressable>
          ))}
        </Card>
        {draft.source === "companion" && <CompanionCard />}
        {draft.source === "health" && (
          <Card style={styles.subCard} testID="health-source-card">
            <Text style={[styles.radioSub, { marginVertical: spacing.sm }]}>
              GlucoShadow checks Apple Health every few minutes while it runs. Dexcom saves to Health with about a 3-hour delay, so use this as
              a backup, not for real-time alarms.
            </Text>
            <Button
              title="Allow reading from Apple Health"
              kind="secondary"
              onPress={() => enableHealthRead().then((n) => toast(`Imported ${n} readings`, "success")).catch((e: Error) => toast(e.message, "error"))}
              testID="health-read-button"
              style={{ marginBottom: spacing.sm }}
            />
          </Card>
        )}
        {draft.source === "bluetooth" && (
          <Card style={styles.subCard} testID="bluetooth-sensor-card">
            <View style={styles.inlineChips}>
              <Text style={styles.inlineLabel}>Sensor</Text>
              <ChipRow options={SENSOR_OPTIONS} value={draft.bt_sensor} onChange={(v) => (set("bt_sensor", v), !sensorLocked && set("sensor_days", v === "dexcom_g6" ? 10 : 10.5))} testIDPrefix="bt-sensor" padded={false} />
            </View>
            {draft.bt_sensor === "dexcom_g6" && (
              <Field
                label="Transmitter ID"
                value={draft.bt_transmitter_id}
                onChangeText={(v) => set("bt_transmitter_id", v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
                placeholder="8XXXXX"
                autoCapitalize="characters"
                testID="bt-transmitter-input"
              />
            )}
            {draft.bt_sensor === "dexcom_g7" && <G7PairingCard settings={settings.data!} onSaved={(d) => qc.setQueryData(["settings"], d)} />}
            <View style={styles.syncRow}>
              <Text style={styles.syncText} testID="bt-paired-device">
                {draft.bt_device_name ? `Paired: ${draft.bt_device_name}` : "No sensor paired yet"}
              </Text>
              <Button
                title={draft.bt_device_name ? "Pair again" : "Pair sensor"}
                kind="secondary"
                onPress={async () => {
                  if (dirty) await save.mutateAsync().catch(() => null);
                  router.push("/sensor");
                }}
                testID="bt-pair-button"
              />
            </View>
          </Card>
        )}
        {mode === "master" && <Hint>Turn on Nightscout, Tidepool or Dexcom Share upload in Upload to cloud so your readings are shared.</Hint>}
        {draft.source === "dexcom" && (
          <Card style={styles.subCard}>
            <DexcomLoginFields
              draft={draft}
              set={set}
              secret={secrets.dexcom_password}
              onSecret={(v) => setSecret("dexcom_password", v)}
              secretPh={secretPh("dexcom_password")}
            />
          </Card>
        )}
        {draft.source === "libre" && (
          <Card style={styles.subCard}>
            <Field label="Email" value={draft.libre_email} onChangeText={(v) => set("libre_email", v)} placeholder="LibreLinkUp email" keyboardType="email-address" testID="libre-email-input" />
            <Field
              label="Password"
              last
              value={secrets.libre_password}
              onChangeText={(v) => setSecret("libre_password", v)}
              placeholder={secretPh("libre_password")}
              secureTextEntry
              testID="libre-password-input"
            />
          </Card>
        )}
        {draft.source === "nightscout" && (
          <Card style={styles.subCard}>
            <Field label="Site URL" value={draft.ns_url} onChangeText={(v) => set("ns_url", v.trim())} placeholder="https://mysite.herokuapp.com" keyboardType="url" testID="nightscout-url-input" />
            <Field
              label="API secret"
              last
              value={secrets.ns_secret}
              onChangeText={(v) => setSecret("ns_secret", v)}
              placeholder={secretPh("ns_secret")}
              secureTextEntry
              testID="nightscout-secret-input"
            />
          </Card>
        )}
        <CloudFollowerFields
          draft={draft}
          set={set}
          secrets={secrets}
          setSecret={setSecret}
          secretPh={secretPh}
          beforeSignIn={async () => {
            if (dirty) await save.mutateAsync();
          }}
          onSignedIn={() => {
            setDirty(false);
            qc.invalidateQueries();
          }}
        />
        {draft.source === "dexcom" && <Hint>Turn on Share in your Dexcom app and add at least one follower.</Hint>}
        {draft.source === "libre" && (
          <Hint>Invite this email as a follower from your Libre app, accept it in LibreLinkUp, then sign in here.</Hint>
        )}
        {draft.source === "nightscout" && (
          <Hint>The address and API secret of the Nightscout site that your uploader (Eversense, Medtrum, AAPS, Loop, etc.) already sends readings to.</Hint>
        )}
        <View style={styles.syncRow}>
          <Text style={styles.syncText} testID="settings-sync-status">
            {status.data?.last_error
              ? `Problem: ${status.data.last_error}`
              : status.data?.reading
                ? `Last reading ${agoText(status.data.reading.ts)}`
                : "No readings yet"}
          </Text>
          {draft.source === "bluetooth" ? (
            <Button
              title={scanLeft > 0 ? `Scanning… ${Math.floor(scanLeft / 60)}:${String(scanLeft % 60).padStart(2, "0")}` : "Scan now"}
              kind="secondary"
              onPress={() => scanNow(draft.bt_device_id || undefined)}
              disabled={scanLeft > 0}
              testID="settings-scan-button"
            />
          ) : (
            <Button title="Sync now" kind="secondary" onPress={() => syncNow.mutate()} loading={syncNow.isPending} testID="settings-sync-button" />
          )}
        </View>
        {mode === "follower" && draft.source !== "companion" && (
          <>
            <Card style={styles.subCard}>
              <Field label="Pull every" last value={String(draft.pull_minutes)} onChangeText={(v) => setNum("pull_minutes", v)} keyboardType="number-pad" suffix="min" testID="pull-minutes-input" />
            </Card>
            <Hint>
              How often new readings are pulled from the cloud (1 to 30 minutes). Dexcom makes a new reading every 5 minutes, so asking much more
              often than that only adds load.
            </Hint>
            <Hint>Want the phone to read the sensor itself by Bluetooth? Switch to Master.</Hint>
          </>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}
