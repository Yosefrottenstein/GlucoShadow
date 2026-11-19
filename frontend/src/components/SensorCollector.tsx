import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { AppState } from "react-native";

import { api, Settings } from "@/src/api";
import { bleSupported } from "@/src/ble";
import { setG7ActivationHandler, setG7EndHandler, startG7, stopG7 } from "@/src/g7";
import { configureCompanion, drainCompanion } from "@/src/companion";
import { getToken } from "@/src/auth";
import { healthPlatform, readHealth, syncHealth } from "@/src/health";
import { drainSmsOutbox, phoneSmsSupported } from "@/src/phoneSms";
import { scheduleReminders, scheduleSensorAlerts } from "@/src/sensorAlerts";

// App-wide background work: the direct Bluetooth reader (Dexcom G7), phone texts and sensor-ending reminders.
export function SensorCollector() {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => api<Settings>("/settings") });
  const s = settings.data;
  const bt = bleSupported && s?.source === "bluetooth";
  const g7 = bt && s?.bt_sensor === "dexcom_g7";
  const deviceId = s?.bt_device_id || undefined;
  const phoneSms = phoneSmsSupported && s?.em_enabled && s.em_contacts.some((c) => c.sms.enabled && c.sms_via === "phone");

  useEffect(() => {
    if (!g7) return;
    setG7ActivationHandler(async (activatedAt) => {
      const current = qc.getQueryData<Settings>(["settings"]);
      const known = current?.sensor_started_at ? Date.parse(current.sensor_started_at) : 0;
      const stopped = current?.sensor_stopped_at ? Date.parse(current.sensor_stopped_at) : 0;
      if (activatedAt.getTime() <= stopped) return; // you stopped this sensor session on purpose
      if (Math.abs(known - activatedAt.getTime()) < 3600000) return;
      const data = await api<Settings>("/settings", {
        method: "PUT",
        body: { sensor_started_at: activatedAt.toISOString(), sensor_days: 10.5 },
      }).catch(() => null);
      if (data) {
        qc.setQueryData(["settings"], data);
        qc.invalidateQueries({ queryKey: ["status"] });
      }
    });
    setG7EndHandler(async () => {
      const current = qc.getQueryData<Settings>(["settings"]);
      if (!current?.sensor_started_at) return;
      // the sensor told us its session is over: clear it, no need to enter anything
      const data = await api<Settings>("/settings", { method: "PUT", body: { sensor_started_at: null, sensor_stopped_at: new Date().toISOString() } }).catch(() => null);
      if (data) {
        qc.setQueryData(["settings"], data);
        qc.invalidateQueries({ queryKey: ["status"] });
      }
    });
    startG7(deviceId);
    return () => {
      setG7EndHandler(null);
      stopG7();
    };
  }, [g7, deviceId, qc]);

  // Any Bluetooth Dexcom sensor: when the sensor's life is over (G6 10 days, G7 10.5 days + 12 h grace) the session clears by itself.
  const startedAt = s?.sensor_started_at ?? null;
  useEffect(() => {
    if (!bt || !startedAt) return;
    const lifeMs = (s?.bt_sensor === "dexcom_g7" ? 10.5 * 86400000 + 12 * 3600000 : (s?.sensor_days ?? 10) * 86400000);
    const check = async () => {
      if (Date.now() < Date.parse(startedAt) + lifeMs) return;
      const data = await api<Settings>("/settings", { method: "PUT", body: { sensor_started_at: null, sensor_stopped_at: new Date().toISOString() } }).catch(() => null);
      if (data) {
        qc.setQueryData(["settings"], data);
        qc.invalidateQueries({ queryKey: ["status"] });
      }
    };
    check();
    const t = setInterval(check, 60000);
    return () => clearInterval(t);
  }, [bt, startedAt, s?.bt_sensor, s?.sensor_days, qc]);

  const companion = s?.source === "companion";
  useEffect(() => {
    if (!companion) return;
    // hand the server address + sign-in to the Android listener so it uploads even when the app is closed
    configureCompanion(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api`, getToken());
    drainCompanion();
    const t = setInterval(drainCompanion, 60000);
    return () => {
      clearInterval(t);
      configureCompanion("", null);
    };
  }, [companion]);

  const healthSource = healthPlatform && s?.source === "health";
  useEffect(() => {
    if (!healthSource) return;
    readHealth();
    const t = setInterval(readHealth, 5 * 60000);
    return () => clearInterval(t);
  }, [healthSource]);

  useEffect(() => {
    if (!healthPlatform) return;
    syncHealth();
    const t = setInterval(syncHealth, 5 * 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!phoneSms) return;
    drainSmsOutbox();
    const t = setInterval(drainSmsOutbox, 20000);
    const sub = AppState.addEventListener("change", (st) => st === "active" && drainSmsOutbox());
    return () => {
      clearInterval(t);
      sub.remove();
    };
  }, [phoneSms]);

  useEffect(() => {
    if (s) scheduleSensorAlerts(s).catch(() => {});
  }, [s?.sensor_started_at, s?.sensor_days, s?.sensor_warn_enabled, s?.sensor_warn_style, s?.sensor_warn_offsets?.join(","), s]);

  useEffect(() => {
    if (s) scheduleReminders(s).catch(() => {});
  }, [s]);

  return null;
}
