import type { ThresholdSnapshot, Thresholds } from "@/src/api";

/**
 * Builds a lookup from a point in time to the target/tight range and alarm thresholds that were
 * actually in effect then — so a graph can show a past day the way it really looked (its own
 * range, its own dot colours), instead of painting history with today's current settings.
 *
 * `history` should be GET /thresholds-history (oldest first; any order is fine, this sorts it).
 * `fallback` is used whenever there is no history yet (ranges were never changed).
 */
export function thresholdResolver(history: ThresholdSnapshot[] | undefined, fallback: Thresholds) {
  const snaps = [...(history ?? [])].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  return (atMs: number): Thresholds => {
    if (!snaps.length) return fallback;
    // last snapshot whose effective time is at or before `atMs`; if atMs is before the very
    // first recorded change, use that first one anyway (best we know for that long ago)
    let lo = 0;
    let hi = snaps.length - 1;
    let idx = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (Date.parse(snaps[mid].ts) <= atMs) {
        idx = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return snaps[idx];
  };
}
