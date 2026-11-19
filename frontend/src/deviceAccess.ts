// Android-only settings screens GlucoShadow needs: battery optimisation, Do not disturb override, exact alarms.
// Needs the installed Android app (not Expo Go). On iPhone and in Expo Go everything reports "not applicable".
import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

type Native = {
  batteryUnrestricted(): boolean;
  requestBatteryUnrestricted(): void;
  dndAccess(): boolean;
  openDndAccess(): void;
  exactAlarms(): boolean;
  openExactAlarms(): void;
  startKeepAlive(title: string, text: string): void;
  stopKeepAlive(): void;
};
const native = Platform.OS === "android" ? requireOptionalNativeModule<Native>("DeviceAccess") : null;

export const deviceAccessSupported = !!native;
export const batteryUnrestricted = () => !!native?.batteryUnrestricted();
export const requestBatteryUnrestricted = () => native?.requestBatteryUnrestricted();
export const dndAccess = () => !!native?.dndAccess();
export const openDndAccess = () => native?.openDndAccess();
export const exactAlarms = () => !!native?.exactAlarms();
export const openExactAlarms = () => native?.openExactAlarms();
export const startKeepAlive = (title: string, text: string) => native?.startKeepAlive(title, text);
export const stopKeepAlive = () => native?.stopKeepAlive();
