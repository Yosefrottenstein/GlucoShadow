import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

import { deviceAccessSupported, startKeepAlive, stopKeepAlive } from "@/src/deviceAccess";

const KEY = "keep-running";
let listeners: ((v: boolean) => void)[] = [];

/** User choice "Keep GlucoShadow running in the background" (on by default). */
export async function setKeepRunning(v: boolean) {
  await AsyncStorage.setItem(KEY, v ? "on" : "off").catch(() => {});
  listeners.forEach((l) => l(v));
}

export function useKeepRunning(): [boolean, (v: boolean) => void] {
  const [on, setOn] = useState(true);
  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => v === "off" && setOn(false)).catch(() => {});
    listeners.push(setOn);
    return () => {
      listeners = listeners.filter((l) => l !== setOn);
    };
  }, []);
  return [on, setKeepRunning];
}

/** Runs the Android foreground service while signed in, so the phone does not stop the app with the screen off. */
export function KeepAlive() {
  const [on] = useKeepRunning();
  useEffect(() => {
    if (!deviceAccessSupported) return;
    if (on) startKeepAlive("GlucoShadow is running", "Watching your glucose and alarms");
    else stopKeepAlive();
    return () => stopKeepAlive();
  }, [on]);
  return null;
}
