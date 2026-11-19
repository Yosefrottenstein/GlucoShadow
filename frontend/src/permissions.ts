// Everything GlucoShadow needs from the phone, in one list: what it is, why, how to check it, how to ask for it.
// Each request shows the system dialog when Android/iOS allow it, otherwise opens the right settings screen.
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, PermissionsAndroid, Platform } from "react-native";

import type { Settings } from "./api";
import { getManager, requestAndroidBluetooth } from "./ble";
import { companionHasAccess, companionSupported, openCompanionAccess } from "./companion";
import {
  batteryUnrestricted,
  deviceAccessSupported,
  dndAccess,
  exactAlarms,
  openDndAccess,
  openExactAlarms,
  requestBatteryUnrestricted,
} from "./deviceAccess";
import { isAndroid, requestSmsPermission, smsPermission } from "./phoneSms";

export type PermId = "notifications" | "battery" | "dnd" | "exact" | "location" | "bluetooth" | "sms" | "notifAccess";

export type PermItem = {
  id: PermId;
  title: string;
  why: string;
  /** shown for this phone and these settings? */
  applies: (s: Settings | undefined) => boolean;
  /** must be on for alarms to be reliable (the start-up screen keeps asking for these) */
  critical?: boolean;
  check: () => Promise<boolean>;
  request: () => Promise<void>;
};

const web = Platform.OS === "web";
const hasSmsContact = (s?: Settings) => !!s?.em_enabled && s.em_contacts.some((c) => c.sms.enabled);

export const PERMISSIONS: PermItem[] = [
  {
    id: "notifications",
    title: "Notifications",
    why: "Alarms, sensor warnings and reminders need to show on your screen and make sound.",
    applies: () => !web,
    critical: true,
    check: async () => (await Notifications.getPermissionsAsync()).granted,
    request: async () => {
      const cur = await Notifications.getPermissionsAsync();
      if (cur.granted) return;
      if (!cur.canAskAgain) return void Linking.openSettings();
      const r = await Notifications.requestPermissionsAsync();
      if (!r.granted && !r.canAskAgain) Linking.openSettings();
    },
  },
  {
    id: "battery",
    title: "Run in the background",
    why: "Turns off battery optimization for GlucoShadow so Android does not stop it. Without this, alarms and readings can stop when the screen is off.",
    applies: () => isAndroid && deviceAccessSupported,
    critical: true,
    check: async () => batteryUnrestricted(),
    request: async () => requestBatteryUnrestricted(),
  },
  {
    id: "dnd",
    title: "Sound when the phone is silent",
    why: "Lets urgent alarms play even in silent mode or Do not disturb. In the screen that opens, turn on GlucoShadow.",
    applies: () => isAndroid && deviceAccessSupported,
    critical: true,
    check: async () => dndAccess(),
    request: async () => openDndAccess(),
  },
  {
    id: "exact",
    title: "Exact alarm timing",
    why: "Lets reminders and sensor warnings go off at the exact minute.",
    applies: () => isAndroid && deviceAccessSupported,
    check: async () => exactAlarms(),
    request: async () => openExactAlarms(),
  },
  {
    id: "location",
    title: "Location",
    why: "Adds a map link and address to emergency texts and calls.",
    applies: (s) => !web && !!s?.em_enabled && !!s.em_location,
    check: async () => (await Location.getForegroundPermissionsAsync()).granted,
    request: async () => {
      const cur = await Location.getForegroundPermissionsAsync();
      if (cur.granted) return;
      if (!cur.canAskAgain) return void Linking.openSettings();
      const r = await Location.requestForegroundPermissionsAsync();
      if (!r.granted && !r.canAskAgain) Linking.openSettings();
    },
  },
  {
    id: "bluetooth",
    title: "Bluetooth",
    why: "Lets GlucoShadow find and listen to your Dexcom sensor. Android calls this permission Nearby devices.",
    applies: (s) => !web && s?.source === "bluetooth",
    check: async () => {
      if (isAndroid) {
        const P = PermissionsAndroid.PERMISSIONS;
        const list = Number(Platform.Version) >= 31 ? [P.BLUETOOTH_SCAN, P.BLUETOOTH_CONNECT] : [P.ACCESS_FINE_LOCATION];
        return (await Promise.all(list.map((p) => PermissionsAndroid.check(p)))).every(Boolean);
      }
      return (await getManager()?.state?.()) !== "Unauthorized";
    },
    request: async () => {
      if (isAndroid) {
        if ((await requestAndroidBluetooth()) === "blocked") Linking.openSettings();
        return;
      }
      if ((await getManager()?.state?.()) === "Unauthorized") Linking.openSettings();
    },
  },
  {
    id: "sms",
    title: "Send text messages",
    why: "Lets this phone send emergency texts to your contacts from its own SIM card.",
    applies: (s) => isAndroid && hasSmsContact(s),
    check: async () => smsPermission(),
    request: async () => {
      if ((await requestSmsPermission()) === "blocked") Linking.openSettings();
    },
  },
  {
    id: "notifAccess",
    title: "Notification access",
    why: "Lets GlucoShadow read the glucose number from your sensor app's notification (Companion app). In the screen that opens, turn on GlucoShadow.",
    applies: (s) => isAndroid && companionSupported && s?.source === "companion",
    critical: true,
    check: async () => companionHasAccess(),
    request: async () => openCompanionAccess(),
  },
];

export type PermState = Partial<Record<PermId, boolean>>;

/** Live status of every permission that applies, refreshed whenever the app returns from a settings screen. */
export function usePermissions(settings: Settings | undefined) {
  const [state, setState] = useState<PermState>({});
  const items = PERMISSIONS.filter((p) => p.applies(settings));
  const key = items.map((p) => p.id).join(",");
  const latest = useRef(settings);
  latest.current = settings;

  const refresh = useCallback(async () => {
    const next: PermState = {};
    for (const p of PERMISSIONS.filter((x) => x.applies(latest.current))) next[p.id] = await p.check().catch(() => false);
    setState(next);
  }, []);

  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener("change", (st) => st === "active" && refresh());
    return () => sub.remove();
  }, [key, refresh]);

  const missing = items.filter((p) => state[p.id] === false);
  return { items, state, missing, refresh };
}
