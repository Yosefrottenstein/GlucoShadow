import Ionicons from "@react-native-vector-icons/ionicons";
import { Camera, CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";

import { api, Settings } from "@/src/api";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { useToast } from "../Toast";
import { Button } from "../ui";

type Method = "paste" | "scan" | "upload";

/**
 * One-time setup for G7 / ONE+ / Stelo pairing, done once per phone (not per sensor). The long
 * setup code can be entered three ways: pasted as text, scanned live with the camera, or read
 * from a QR-code photo already in the phone's gallery.
 */
export function G7PairingCard({ settings, onSaved }: { settings: Settings; onSaved: (s: Settings) => void }) {
  const styles = useStyles();
  const toast = useToast();
  const qc = useQueryClient();
  const [method, setMethod] = useState<Method>("paste");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const saved = settings.g7_pairing_code_set;

  const commit = async (value: string) => {
    if (!value.trim()) return toast("That did not contain a setup code", "error");
    setBusy(true);
    try {
      const data = await api<Settings>("/settings", { method: "PUT", body: { g7_pairing_code: value.trim() } });
      qc.setQueryData(["settings"], data);
      onSaved(data);
      setCode("");
      toast("Sensor pairing set up. You won't need this again on this phone.", "success");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    try {
      const data = await api<Settings>("/settings", { method: "PUT", body: { g7_pairing_code: "" } });
      qc.setQueryData(["settings"], data);
      onSaved(data);
      toast("Pairing setup removed", "info");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const openScanner = async () => {
    if (!permission?.granted) {
      const r = await requestPermission();
      if (!r.granted) return toast("Camera access is needed to scan the code", "error");
    }
    setScanning(true);
  };

  const onScanned = async (data: string) => {
    if (!scanning) return; // avoid firing twice for the same frame
    setScanning(false);
    await commit(data);
  };

  const uploadQr = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });
    if (res.canceled || !res.assets?.[0]?.uri) return;
    setBusy(true);
    try {
      const results = await Camera.scanFromURLAsync(res.assets[0].uri, ["qr"]);
      if (!results.length) {
        toast("No QR code found in that photo", "error");
        setBusy(false);
        return;
      }
      await commit(results[0].data);
    } catch (e) {
      toast("Could not read that photo", "error");
      setBusy(false);
    }
  };

  if (saved) {
    return (
      <View style={styles.box} testID="g7-pairing-card">
        <Text style={styles.title}>Sensor pairing setup</Text>
        <Text style={styles.sub}>Set up on this phone. A new sensor pairs on its own from now on — no code needed.</Text>
        <Button title="Remove setup" kind="secondary" onPress={clear} loading={busy} testID="g7-pairing-clear-button" />
      </View>
    );
  }

  return (
    <View style={styles.box} testID="g7-pairing-card">
      <Text style={styles.title}>Sensor pairing setup</Text>
      <Text style={styles.sub}>One-time only, for this phone. Needed once before the first G7, ONE+ or Stelo sensor pairs.</Text>

      <View style={styles.methodRow}>
        <MethodTab icon="clipboard-outline" label="Paste code" active={method === "paste"} onPress={() => setMethod("paste")} testID="g7-method-paste" />
        <MethodTab icon="scan-outline" label="Scan QR" active={method === "scan"} onPress={() => setMethod("scan")} testID="g7-method-scan" />
        <MethodTab icon="image-outline" label="Upload QR" active={method === "upload"} onPress={() => setMethod("upload")} testID="g7-method-upload" />
      </View>

      {method === "paste" && (
        <>
          <TextInput
            testID="g7-pairing-input"
            value={code}
            onChangeText={setCode}
            placeholder="Paste the setup code here"
            placeholderTextColor="#8A97A0"
            multiline
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Button title="Save" onPress={() => commit(code)} loading={busy} testID="g7-pairing-save-button" />
        </>
      )}

      {method === "scan" && (
        <>
          <Text style={styles.note}>Opens the camera to scan the setup QR code.</Text>
          <Button title="Open camera" onPress={openScanner} loading={busy} testID="g7-pairing-scan-button" />
        </>
      )}

      {method === "upload" && (
        <>
          <Text style={styles.note}>Choose a photo of the setup QR code from your gallery.</Text>
          <Button title="Choose photo" onPress={uploadQr} loading={busy} testID="g7-pairing-upload-button" />
        </>
      )}

      <Modal visible={scanning} animationType="slide" onRequestClose={() => setScanning(false)}>
        <View style={{ flex: 1, backgroundColor: "#000" }}>
          <CameraView
            testID="g7-qr-camera"
            style={{ flex: 1 }}
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={(r) => onScanned(r.data)}
          />
          <Pressable testID="g7-qr-camera-close" onPress={() => setScanning(false)} style={styles.closeScan}>
            <Ionicons name="close" size={22} color="#fff" />
            <Text style={styles.closeScanText}>Cancel</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

function MethodTab({ icon, label, active, onPress, testID }: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string; active: boolean; onPress: () => void; testID: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} style={[styles.methodTab, active && styles.methodTabOn]}>
      <Ionicons name={icon} size={16} color={active ? colors.onBrandPrimary : colors.muted} />
      <Text style={[styles.methodTabText, active && styles.methodTabTextOn]}>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  box: { backgroundColor: c.surface, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm, gap: spacing.sm },
  title: { fontFamily: fonts.text, fontSize: 14, fontWeight: "700", color: c.onSurface },
  sub: { fontFamily: fonts.text, fontSize: 12, lineHeight: 17, color: c.muted },
  note: { fontFamily: fonts.text, fontSize: 12, lineHeight: 17, color: c.muted },
  methodRow: { flexDirection: "row", gap: spacing.xs },
  methodTab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, height: 38, borderRadius: radius.sm, backgroundColor: c.surfaceSecondary },
  methodTabOn: { backgroundColor: c.brandPrimary },
  methodTabText: { fontFamily: fonts.text, fontSize: 12, fontWeight: "700", color: c.muted },
  methodTabTextOn: { color: c.onBrandPrimary },
  input: {
    minHeight: 72,
    borderRadius: radius.sm,
    backgroundColor: c.surfaceSecondary,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fonts.text,
    fontSize: 13,
    color: c.onSurface,
    textAlignVertical: "top",
  },
  closeScan: { position: "absolute", top: 50, right: 20, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20 },
  closeScanText: { color: "#fff", fontFamily: fonts.text, fontSize: 14, fontWeight: "700" },
}));
