// Shared state and actions for the whole Settings area. One provider wraps every settings screen
// (the menu and each category) so they all read and write the same draft, and Save works the
// same way no matter which category you're looking at. This is the same logic the old single-page
// Settings screen used; it just now lives here so several screens can share it.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { Alert } from "react-native";
import { format, isValid, parse } from "date-fns";

import { api, GlucoseAlarm, Reminder, Settings, Source, Status, Unit } from "@/src/api";
import { ThrKey, TARGET, THR } from "@/src/components/settings/AlarmsSection";
import { validTime } from "@/src/components/ScheduleEditor";
import { SecretKey } from "@/src/components/settings/UploadsSection";
import { fromDisplay, toDisplay } from "@/src/glucose";
import { useToast } from "@/src/components/Toast";
import { notificationPermission, notificationsSupported, requestNotificationPermission } from "@/src/sensorAlerts";
import { stopSound } from "@/src/sounds";
import { scanNow, useG7Status } from "@/src/g7";
import { useKeepRunning } from "@/src/components/KeepAlive";
import { usePermissions } from "@/src/permissions";

const ALL_THR: { key: ThrKey; label: string }[] = [...TARGET, ...THR];

const EMPTY_SECRETS: Record<SecretKey, string> = {
  ns_secret: "",
  dexcom_password: "",
  libre_password: "",
  tp_password: "",
  twiist_password: "",
  cl_password: "",
  glooko_password: "",
};

export type SourceOpt = { value: Source; title: string; sub: string };

// The sensor length follows the sensor automatically, nobody has to pick it.
const autoSensorDays = (s: Settings) =>
  s.source === "bluetooth" ? (s.bt_sensor === "dexcom_g6" ? 10 : 10.5) : s.source === "libre" ? 14 : s.source === "carelink" ? 7 : 10.5;

export const FOLLOWER_SOURCES = (isAndroid: boolean, healthPlatform: unknown): SourceOpt[] => [
  { value: "dexcom", title: "Dexcom Share", sub: "Dexcom G6, G7, ONE, ONE+ and Stelo with Share turned on" },
  { value: "libre", title: "LibreLinkUp", sub: "FreeStyle Libre 2, 2 Plus, 3 and 3 Plus" },
  { value: "twiist", title: "twiist Insight", sub: "twiist pump with its CGM, using a twiist follower account" },
  { value: "carelink", title: "Medtronic CareLink", sub: "MiniMed 780G, 770G, 740G and Simplera, as care partner or patient" },
  { value: "glooko", title: "Omnipod DISCOVER / Glooko", sub: "Omnipod 5 and other pumps or CGMs that upload to Glooko" },
  { value: "nightscout", title: "Nightscout", sub: "Eversense, Medtrum, AAPS, Loop and any uploader" },
  ...(isAndroid ? [{ value: "companion" as Source, title: "Companion app", sub: "Read glucose from Dexcom, Libre, Omnipod, CamAPS and other apps on this phone" }] : []),
];
export const MASTER_SOURCES = (healthPlatform: unknown): SourceOpt[] => [
  { value: "bluetooth", title: "Bluetooth sensor", sub: "Talk to the Dexcom sensor directly, then upload to Nightscout, Tidepool and Dexcom Share" },
  ...(healthPlatform ? [{ value: "health" as Source, title: "Apple Health", sub: "Use glucose that Dexcom, Libre and other apps save to Apple Health (can be delayed)" }] : []),
  { value: "manual", title: "Manual entry", sub: "Type finger-stick or sensor values yourself" },
  { value: "demo", title: "Demo sensor", sub: "Realistic sample data to try the app" },
];
export const isFollowerSource = (s: Source, list: SourceOpt[]) => list.some((o) => o.value === s);

function useSettingsScreenState() {
  const toast = useToast();
  const router = useRouter();
  const qc = useQueryClient();

  const settings = useQuery({ queryKey: ["settings"], queryFn: () => api<Settings>("/settings") });
  const status = useQuery({ queryKey: ["status"], queryFn: () => api<Status>("/status"), refetchInterval: 30000 });
  const log = useQuery({
    queryKey: ["emergency-log"],
    queryFn: () => api<{ id: string; ts: string; test: boolean; results: string[] }[]>("/emergency/log"),
  });

  const [draft, setDraft] = useState<Settings | null>(null);
  const [thr, setThrState] = useState<Record<ThrKey, string>>({ urgent_low: "", low: "", high: "", urgent_high: "", target_low: "", target_high: "", tight_low: "", tight_high: "" });
  const [secrets, setSecrets] = useState(EMPTY_SECRETS);
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState<number | null>(null); // -1 = new contact
  const [permSheet, setPermSheet] = useState<null | "ask" | "settings">(null);
  const [notifSheet, setNotifSheet] = useState<null | "ask" | "settings">(null);
  const [soundEdit, setSoundEdit] = useState<string | null>(null);
  const [reminderEdit, setReminderEdit] = useState<{ index: number; value: Reminder } | null>(null);
  const [gaEdit, setGaEdit] = useState<{ index: number; value: GlucoseAlarm; text: string } | null>(null);
  const [startText, setStartText] = useState("");

  useEffect(() => {
    if (settings.data && !dirty) {
      setDraft(settings.data);
      setStartText(settings.data.sensor_started_at ? format(new Date(settings.data.sensor_started_at), "yyyy-MM-dd HH:mm") : "");
      setThrState(Object.fromEntries(ALL_THR.map((t) => [t.key, toDisplay(settings.data[t.key], settings.data.unit)])) as Record<ThrKey, string>);
    }
  }, [settings.data, dirty]);

  const sensorLocked = !!settings.data?.sensor_started_at;
  const autoDays = draft ? autoSensorDays(draft) : null;
  const [startSheet, setStartSheet] = useState(false);
  const startNow = async (now: Date) => {
    try {
      const data = await api<Settings>("/settings", { method: "PUT", body: { sensor_started_at: now.toISOString(), sensor_days: autoDays ?? 10.5 } });
      qc.setQueryData(["settings"], data);
      qc.invalidateQueries({ queryKey: ["status"] });
      setStartText(format(now, "yyyy-MM-dd HH:mm"));
      setDraft((d) => (d ? { ...d, sensor_started_at: data.sensor_started_at, sensor_days: data.sensor_days } : d));
      toast("Sensor started", "success");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const startSensor = () => (draft?.source === "bluetooth" ? setStartSheet(true) : startNow(new Date()));

  const stopSensor = () =>
    Alert.alert(
      "Stop this sensor?",
      "The sensor session ends here: the countdown and the sensor ending alarms stop. If you use a G7, the Dexcom app is what really stops the sensor.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Stop sensor",
          style: "destructive",
          onPress: async () => {
            try {
              const data = await api<Settings>("/settings", { method: "PUT", body: { sensor_started_at: null, sensor_stopped_at: new Date().toISOString() } });
              qc.setQueryData(["settings"], data);
              qc.invalidateQueries({ queryKey: ["status"] });
              setStartText("");
              setDraft((d) => (d ? { ...d, sensor_started_at: null, sensor_stopped_at: data.sensor_stopped_at } : d));
              toast("Sensor session stopped", "success");
            } catch (e) {
              toast((e as Error).message, "error");
            }
          },
        },
      ],
    );

  const switchMode = (v: boolean) => {
    if (dirty) return toast("Save your changes first, then switch mode", "error");
    Alert.alert(
      v ? "Switch to Shabbat mode?" : "Switch to standard mode?",
      v
        ? "Shabbat mode has its own alarm and emergency message settings. The first time, they start empty and everything is off, including alarms and emergency messages, so set them up before you need them. Your standard settings are kept."
        : "Your standard alarm and emergency message settings come back as you left them. Your Shabbat settings are kept.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: v ? "Switch to Shabbat" : "Switch to standard",
          onPress: async () => {
            try {
              const data = await api<Settings>("/mode", { method: "POST", body: { shabbat: v } });
              qc.setQueryData(["settings"], data);
              setDraft(data);
              setDirty(false);
              toast(v ? "Shabbat mode on" : "Standard mode on", "success");
            } catch (e) {
              toast((e as Error).message, "error");
            }
          },
        },
      ],
    );
  };

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
    setDirty(true);
  };
  const setNum = (key: keyof Settings, text: string) => set(key, (parseInt(text.replace(/\D/g, ""), 10) || 0) as never);
  const setThr = (k: ThrKey, v: string) => (setThrState((t) => ({ ...t, [k]: v })), setDirty(true));

  const changeUnit = (u: Unit) => {
    if (!draft || u === draft.unit) return;
    const next = { ...thr };
    ALL_THR.forEach((t) => {
      const mg = fromDisplay(thr[t.key], draft.unit);
      next[t.key] = mg ? toDisplay(mg, u) : "";
    });
    setThrState(next);
    set("unit", u);
  };

  const buildPatch = () => {
    if (!draft) throw new Error("Settings not loaded");
    const patch: Record<string, unknown> = { ...draft };
    for (const t of ALL_THR) {
      const mg = fromDisplay(thr[t.key], draft.unit);
      if (!mg) throw new Error(`Enter a value for ${t.label.toLowerCase()}.`);
      patch[t.key] = mg;
    }
    if (!((patch.target_low as number) <= (patch.tight_low as number) && (patch.tight_low as number) < (patch.tight_high as number) && (patch.tight_high as number) <= (patch.target_high as number)))
      throw new Error("The tight range must sit inside the target range.");
    if (!settings.data?.sensor_started_at) patch.sensor_days = autoSensorDays(draft);
    patch.pull_minutes = Math.min(30, Math.max(1, Number(draft.pull_minutes) || 2));
    patch.upload_minutes = Math.min(60, Math.max(1, Number(draft.upload_minutes) || 1));
    (Object.keys(EMPTY_SECRETS) as SecretKey[]).forEach((k) => {
      patch[k] = secrets[k];
      delete patch[`${k}_set`];
    });
    patch.tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    if (startText.trim()) {
      const d = parse(startText.trim(), "yyyy-MM-dd HH:mm", new Date());
      if (!isValid(d) || d.getTime() > Date.now() + 60000) throw new Error("Sensor start: use YYYY-MM-DD HH:MM, not in the future.");
      patch.sensor_started_at = d.toISOString();
    } else patch.sensor_started_at = null;
    return patch;
  };

  const save = useMutation({
    mutationFn: async () => api<Settings>("/settings", { method: "PUT", body: buildPatch() }),
    onSuccess: (data) => {
      qc.setQueryData(["settings"], data);
      setSecrets(EMPTY_SECRETS);
      setDirty(false);
      qc.invalidateQueries();
      toast("Settings saved", "success");
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  const action = (path: string, okText: (d: any) => string) =>
    useMutation({
      mutationFn: async () => {
        if (dirty) await save.mutateAsync();
        return api<any>(path, { method: "POST" });
      },
      onSuccess: (d) => {
        qc.invalidateQueries();
        toast(okText(d), "success");
      },
      onError: (e: Error) => toast(e.message, "error"),
    });
  /* eslint-disable react-hooks/rules-of-hooks */
  const g7Status = useG7Status();
  const perms = usePermissions(draft ?? settings.data);
  const [keepRunning, setKeepRunning] = useKeepRunning();
  const scanLeft = g7Status.scanEndsAt ? Math.max(0, Math.ceil((g7Status.scanEndsAt - Date.now()) / 1000)) : 0;
  const syncNow = action("/sync", (d) => (d.error ? `Sync problem: ${d.error}` : `Synced. ${d.added} new readings`));
  const nsUpload = action("/nightscout/upload", (d) => `Uploaded ${d.uploaded} items to Nightscout`);
  const tpUpload = action("/tidepool/upload", (d) => `Uploaded ${d.uploaded} items to Tidepool`);
  const dxUpload = action("/dexcom/upload", (d) => `Uploaded ${d.uploaded} readings to Dexcom Share`);
  const emTest = action("/emergency/test", (d) => d.results.join(" · ") || "Test sent");
  /* eslint-enable react-hooks/rules-of-hooks */

  const ensureLocation = async () => {
    const p = await Location.getForegroundPermissionsAsync();
    if (!p.granted) setPermSheet(p.canAskAgain ? "ask" : "settings");
  };
  const requestLocation = async () => {
    const r = await Location.requestForegroundPermissionsAsync();
    if (r.granted) {
      setPermSheet(null);
      toast("Location will be included in emergency texts", "success");
    } else setPermSheet("settings");
  };

  const ensureNotifications = async () => {
    if (!notificationsSupported) return;
    const p = await notificationPermission();
    if (!p.granted) setNotifSheet(p.canAskAgain ? "ask" : "settings");
  };
  const requestNotifications = async () => {
    const r = await requestNotificationPermission();
    if (r.granted) {
      setNotifSheet(null);
      toast("Sensor reminders turned on", "success");
    } else setNotifSheet("settings");
  };

  const saveGlucoseAlarm = () => {
    if (!gaEdit || !draft) return;
    const g = gaEdit.value;
    const mg = fromDisplay(gaEdit.text, draft.unit);
    if (!g.title.trim()) return toast("Give the alarm a title", "error");
    if (!mg || mg < 40 || mg > 400) return toast(`Enter a value between ${toDisplay(40, draft.unit)} and ${toDisplay(400, draft.unit)}`, "error");
    if (g.repeat_minutes < 1 || g.snooze_minutes < 1) return toast("Repeat and snooze must be at least 1 minute", "error");
    const list = [...draft.glucose_alarms];
    const clean = { ...g, title: g.title.trim(), value: mg };
    if (gaEdit.index >= 0) list[gaEdit.index] = clean;
    else list.push(clean);
    set("glucose_alarms", list);
    setGaEdit(null);
    stopSound();
    toast("Alarm ready. Tap Save to keep it.", "info");
  };

  const saveReminder = () => {
    if (!reminderEdit || !draft) return;
    const r = reminderEdit.value;
    if (!r.title.trim()) return toast("Give the reminder a title", "error");
    if (!validTime(r.time)) return toast("Enter the time as HH:MM, e.g. 08:30", "error");
    if (r.repeat === "once" && !/^\d{4}-\d{2}-\d{2}$/.test(r.date ?? "")) return toast("Enter the date as YYYY-MM-DD", "error");
    const list = [...draft.reminders];
    const clean = { ...r, title: r.title.trim() };
    if (reminderEdit.index >= 0) list[reminderEdit.index] = clean;
    else list.push(clean);
    set("reminders", list);
    setReminderEdit(null);
    stopSound();
    ensureNotifications();
    toast("Reminder ready. Tap Save to keep it.", "info");
  };

  const setSecret = (k: SecretKey, v: string) => (setSecrets((s) => ({ ...s, [k]: v })), setDirty(true));
  const secretPh = (k: SecretKey) => (draft?.[`${k}_set` as keyof Settings] ? "Saved ••••••" : "Not set");

  return {
    router, qc, settings, status, log,
    draft, setDraft, dirty, setDirty,
    thr, setThr, secrets, setSecret, secretPh, changeUnit,
    set, setNum,
    save,
    sensorLocked, autoDays, startText, setStartText,
    startSheet, setStartSheet, startNow, startSensor, stopSensor, switchMode,
    action, syncNow, nsUpload, tpUpload, dxUpload, emTest,
    g7Status, perms, keepRunning, setKeepRunning, scanLeft,
    ensureLocation, requestLocation, permSheet, setPermSheet,
    ensureNotifications, requestNotifications, notifSheet, setNotifSheet,
    soundEdit, setSoundEdit, reminderEdit, setReminderEdit, gaEdit, setGaEdit,
    saveGlucoseAlarm, saveReminder,
    editing, setEditing,
  };
}

export type SettingsScreenState = ReturnType<typeof useSettingsScreenState>;
const SettingsCtx = createContext<SettingsScreenState | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const value = useSettingsScreenState();
  return <SettingsCtx.Provider value={value}>{children}</SettingsCtx.Provider>;
}

export function useSettingsScreen(): SettingsScreenState {
  const v = useContext(SettingsCtx);
  if (!v) throw new Error("useSettingsScreen must be used inside <SettingsProvider>");
  return v;
}
