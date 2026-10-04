import { resample } from "../engine/data";
import type { Candle } from "../engine/types";
import { MTF_TIMEFRAMES, type MtfDataset, type MtfTf } from "./types";

/**
 * Builds every timeframe at or above the base timeframe by aggregating the base candles.
 * Timeframes finer than the base cannot be created and are left out.
 */
export function buildFromBase(base: Candle[], baseMinutes: number, source: string, live = false): MtfDataset {
  const frames: MtfDataset["frames"] = {};
  const notes: string[] = [];
  for (const [tf, m] of Object.entries(MTF_TIMEFRAMES) as [MtfTf, number][]) {
    if (m < baseMinutes) { notes.push(`${tf} not available (data is ${baseMinutes}-minute).`); continue; }
    frames[tf] = m === baseMinutes ? base : dropIncompleteLast(resample(base, m), base, m);
  }
  return { source, live, frames, notes };
}

/** The last aggregated bucket is incomplete if the base data stops before it closes. */
function dropIncompleteLast(agg: Candle[], base: Candle[], minutes: number): Candle[] {
  const last = agg[agg.length - 1];
  const baseLast = base[base.length - 1];
  if (!last || !baseLast) return agg;
  const baseStep = base.length > 1 ? base[base.length - 1].t - base[base.length - 2].t : 0;
  return baseLast.t + baseStep < last.t + minutes * 60_000 ? agg.slice(0, -1) : agg;
}
