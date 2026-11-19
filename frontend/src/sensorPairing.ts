// Starting a Dexcom sensor from this app, the way xDrip+ does it (Bluetooth sensors: G6 / ONE and G7 / ONE+ / Stelo).
//
// A new Dexcom sensor only accepts a new owner after a security handshake: the G7 uses an elliptic-curve J-PAKE
// exchange with the 4-digit sensor code printed on the applicator, the G6 uses its transmitter ID plus a session
// start command. That handshake is NOT included in this version. It has to be ported from xDrip+ (open source,
// GPL-3.0) and verified against real sensors before it can be trusted, so this file only defines the hook that
// the start screen calls. Everything around it (the screen, the 5 min 30 s scan, saving the start time, ending the
// session automatically when the sensor ends) is in place.
import type { SensorType } from "./api";

export type PairProgress = (message: string) => void;

export const pairingAvailable = false;

/**
 * Pair with the sensor that was found and start its session. `code` is the optional 4-digit sensor code.
 * Resolves with the time the sensor was started.
 */
export async function pairAndStart(_sensor: SensorType, _deviceId: string, _code: string, progress: PairProgress): Promise<Date> {
  progress("Found the sensor");
  throw new Error("Starting a sensor from GlucoShadow is not built into this version yet. Start it with the Dexcom app; GlucoShadow then picks it up and ends the session by itself when the sensor ends.");
}
