import { useEffect, useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";

import type { SensorType } from "@/src/api";
import { bleSupported, requestAndroidBluetooth, scan, SENSORS, waitForState } from "@/src/ble";
import { pairAndStart, pairingAvailable } from "@/src/sensorPairing";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { Sheet } from "./Sheet";
import { Button } from "./ui";

const SCAN_SECONDS = 330; // 5 minutes 30 seconds: a new sensor can take that long to start advertising

type Phase = "idle" | "scanning" | "pairing" | "failed";

/** Start a Bluetooth Dexcom sensor from the app: optional 4-digit sensor code, then scan up to 5 min 30 s and pair. */
export function SensorStartSheet({
  visible,
  sensor,
  transmitterId,
  onClose,
  onStarted,
}: {
  visible: boolean;
  sensor: SensorType;
  transmitterId: string;
  onClose: () => void;
  onStarted: (at: Date) => Promise<void>;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [code, setCode] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [left, setLeft] = useState(SCAN_SECONDS);
  const [msg, setMsg] = useState("");
  const stop = useRef<null | (() => void)>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = () => {
    stop.current?.();
    stop.current = null;
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => cleanup, []);
  useEffect(() => {
    if (!visible) {
      cleanup();
      setPhase("idle");
      setMsg("");
      setCode("");
    }
  }, [visible]);

  const fail = (m: string) => {
    cleanup();
    setMsg(m);
    setPhase("failed");
  };

  const begin = async () => {
    if (code && code.length !== 4) return setMsg("The sensor code has 4 digits, or leave it empty.");
    if (sensor === "dexcom_g6" && transmitterId.length !== 6) return fail("Enter the 6-character transmitter ID in the sensor settings first.");
    if (!bleSupported) return fail("Bluetooth works only in the installed app, not in the web preview or Expo Go.");
    setMsg("");
    const perm = await requestAndroidBluetooth();
    if (perm !== "granted") return fail("Allow Bluetooth for GlucoShadow in your phone's settings.");
    const state = await waitForState();
    if (state !== "PoweredOn") return fail("Turn Bluetooth on and try again.");
    setLeft(SCAN_SECONDS);
    setPhase("scanning");
    timer.current = setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          fail("No new sensor found in 5 minutes 30 seconds. Check that the sensor is on your body and try again.");
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    let handled = false;
    stop.current = scan(
      sensor,
      transmitterId,
      async (d) => {
        if (handled) return;
        handled = true;
        stop.current?.();
        stop.current = null;
        setPhase("pairing");
        setMsg("Found the sensor, pairing…");
        try {
          const at = await pairAndStart(sensor, d.id, code, setMsg);
          cleanup();
          await onStarted(at);
          onClose();
        } catch (e) {
          fail((e as Error).message);
        }
      },
      (m) => fail(m),
    );
  };

  const mm = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  const busy = phase === "scanning" || phase === "pairing";

  return (
    <Sheet visible={visible} onClose={() => { cleanup(); onClose(); }} title={`Start ${SENSORS[sensor].label} sensor`} testID="sensor-start-sheet">
      <Text style={styles.text}>
        Put the new sensor on, then tap Start sensor. GlucoShadow looks for it for up to 5 minutes 30 seconds, starts it, and ends the session by itself when the sensor ends.
        {pairingAvailable ? "" : " (Pairing is not included in this version yet.)"}
      </Text>
      <Text style={styles.label}>Sensor code (optional)</Text>
      <TextInput
        testID="sensor-code-input"
        value={code}
        onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 4))}
        editable={!busy}
        keyboardType="number-pad"
        maxLength={4}
        placeholder="4 digits from the applicator"
        placeholderTextColor={colors.muted}
        style={[styles.input, !code && { fontSize: 15, letterSpacing: 0 }]}
      />
      {busy && (
        <View style={styles.status} testID="sensor-start-status">
          <Text style={styles.time}>{phase === "scanning" ? mm : "…"}</Text>
          <Text style={styles.text}>{phase === "scanning" ? "Looking for your new sensor. Keep the phone close to it." : msg}</Text>
        </View>
      )}
      {!!msg && !busy && <Text style={[styles.text, { color: phase === "failed" ? colors.error : colors.muted, marginTop: spacing.md }]}>{msg}</Text>}
      {busy ? (
        <Button title="Cancel" kind="secondary" onPress={() => { cleanup(); setPhase("idle"); setMsg(""); }} testID="sensor-cancel-button" style={{ marginTop: spacing.lg }} />
      ) : (
        <Button title="Start sensor" onPress={begin} testID="sensor-begin-button" style={{ marginTop: spacing.lg }} />
      )}
    </Sheet>
  );
}

const useStyles = makeStyles((c) => ({
  text: { fontFamily: fonts.text, fontSize: 14, color: c.onSurfaceTertiary },
  label: { fontFamily: fonts.text, fontSize: 13, color: c.muted, marginTop: spacing.lg, marginBottom: spacing.xs },
  input: { backgroundColor: c.surface, borderRadius: radius.md, padding: spacing.md, fontFamily: fonts.display, fontSize: 22, color: c.onSurface, letterSpacing: 4 },
  status: { alignItems: "center", gap: spacing.xs, marginTop: spacing.lg },
  time: { fontFamily: fonts.display, fontSize: 44, fontWeight: "700", color: c.onSurface },
}));
