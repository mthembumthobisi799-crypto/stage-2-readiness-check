import { addFeatures } from "../engine/features";
import type { Candle, FeatureRow } from "../engine/types";
import { MTF_TIMEFRAMES, type MtfDataset, type MtfTf } from "../providers/types";

export interface CSwing { i: number; price: number; confirm: number }
export interface CFvg { i: number; type: "BULLISH" | "BEARISH"; low: number; high: number }
export interface CZone { i: number; confirm: number; type: "DEMAND" | "SUPPLY"; low: number; high: number }

/**
 * Precomputed, causal view of one timeframe. Every item carries the index at which it
 * became knowable (`confirm` / creation index), so evaluation at index k can ignore anything
 * that was not yet known — this is what keeps backtests free of look-ahead.
 */
export interface TfSeries {
  tf: MtfTf;
  ms: number;
  rows: FeatureRow[];
  highs: CSwing[];
  lows: CSwing[];
  fvgs: CFvg[];
  zones: CZone[];
}

const SW = 3;

export function buildSeries(tf: MtfTf, candles: Candle[]): TfSeries {
  const rows = addFeatures(candles);
  const highs: CSwing[] = [], lows: CSwing[] = [], fvgs: CFvg[] = [], zones: CZone[] = [];
  for (let i = SW; i < rows.length - SW; i++) {
    let isH = true, isL = true;
    for (let j = i - SW; j <= i + SW; j++) {
      if (rows[j].high > rows[i].high) isH = false;
      if (rows[j].low < rows[i].low) isL = false;
    }
    if (isH) highs.push({ i, price: rows[i].high, confirm: i + SW });
    if (isL) lows.push({ i, price: rows[i].low, confirm: i + SW });
  }
  for (let i = 2; i < rows.length; i++) {
    if (rows[i].low > rows[i - 2].high) fvgs.push({ i, type: "BULLISH", low: rows[i - 2].high, high: rows[i].low });
    else if (rows[i].high < rows[i - 2].low) fvgs.push({ i, type: "BEARISH", low: rows[i].high, high: rows[i - 2].low });
  }
  for (let i = 14; i < rows.length - 3; i++) {
    const a = rows[i].atr14;
    if (!Number.isFinite(a)) continue;
    const impulse = rows[i + 1].body + rows[i + 2].body + rows[i + 3].body;
    if (rows[i].range <= 1.25 * a && impulse >= 1.8 * a) {
      if (rows[i + 3].close > rows[i].high) zones.push({ i, confirm: i + 3, type: "DEMAND", low: rows[i].low, high: rows[i].high });
      else if (rows[i + 3].close < rows[i].low) zones.push({ i, confirm: i + 3, type: "SUPPLY", low: rows[i].low, high: rows[i].high });
    }
  }
  return { tf, ms: MTF_TIMEFRAMES[tf] * 60_000, rows, highs, lows, fvgs, zones };
}

export type SeriesSet = Partial<Record<MtfTf, TfSeries>>;

export function buildSeriesSet(ds: MtfDataset): SeriesSet {
  const s: SeriesSet = {};
  for (const [tf, c] of Object.entries(ds.frames) as [MtfTf, Candle[]][]) if (c && c.length) s[tf] = buildSeries(tf, c);
  return s;
}

/** Index of the last candle fully CLOSED at time T, or -1. */
export function closedIndexAt(s: TfSeries, T: number): number {
  let lo = 0, hi = s.rows.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (s.rows[mid].t + s.ms <= T) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

/** Swings confirmed on or before index k. */
export function knownSwings(list: CSwing[], k: number, n: number): CSwing[] {
  const out: CSwing[] = [];
  for (let j = list.length - 1; j >= 0 && out.length < n; j--) if (list[j].confirm <= k) out.unshift(list[j]);
  return out;
}
