import type { FeatureRow } from "../engine/types";
import { closedIndexAt, knownSwings, type SeriesSet, type TfSeries } from "./series";

export type Dir = 1 | -1 | 0;

export interface Component {
  id: "trend4h" | "mss15m" | "sweep" | "fvg" | "supplyDemand" | "candle";
  label: string;
  dir: Dir;
  weight: number;
  detail: string;
}

export interface StrategyPlan {
  direction: "BUY" | "SELL";
  entry: number; entryLow: number; entryHigh: number;
  stop: number; tp1: number; tp2: number; tp3: number;
  rr: [number, number, number];
  invalidation: number;
}

export interface Signal {
  t: number;
  price: number;
  atr15: number;
  score: number; // signed: + bullish, - bearish
  components: Component[];
  setup: boolean; // a complete rule-based setup exists
  plan: StrategyPlan | null;
  reasonNoSetup: string | null;
}

/** Strategy weights. Candle patterns are deliberately low-weight confluence. */
export const WEIGHTS = { trend4h: 3, mss15m: 2.5, sweep: 2, fvg: 1.5, supplyDemand: 1.5, candle: 0.5 } as const;
export const SETUP_MIN_SCORE = 4;

const sgn = (x: number): Dir => (x > 0 ? 1 : x < 0 ? -1 : 0);

function trend4h(s: TfSeries, k: number): Component {
  const r = s.rows[k];
  const emaDir: Dir = r.ema20 > r.ema50 && r.close > r.ema50 ? 1 : r.ema20 < r.ema50 && r.close < r.ema50 ? -1 : 0;
  const h = knownSwings(s.highs, k, 2), l = knownSwings(s.lows, k, 2);
  let stDir: Dir = 0;
  if (h.length === 2 && l.length === 2) {
    if (h[1].price > h[0].price && l[1].price > l[0].price) stDir = 1;
    else if (h[1].price < h[0].price && l[1].price < l[0].price) stDir = -1;
  }
  const both = emaDir !== 0 && emaDir === stDir;
  const dir: Dir = both ? emaDir : emaDir !== 0 && stDir === 0 ? emaDir : stDir !== 0 && emaDir === 0 ? stDir : 0;
  const weight = both ? WEIGHTS.trend4h : dir ? WEIGHTS.trend4h / 2 : 0;
  const detail = `EMA ${emaDir > 0 ? "bullish" : emaDir < 0 ? "bearish" : "flat"}, swings ${stDir > 0 ? "HH/HL" : stDir < 0 ? "LH/LL" : "mixed"}`;
  return { id: "trend4h", label: "4H trend", dir, weight, detail };
}

/** 15m market structure shift: close through the last confirmed swing against the prior swing sequence. */
function mss15(s: TfSeries, k: number): Component {
  const none: Component = { id: "mss15m", label: "15m structure shift", dir: 0, weight: 0, detail: "No recent shift" };
  for (let back = 0; back < 12; back++) {
    const j = k - back;
    if (j < 1) break;
    const h = knownSwings(s.highs, j - 1, 2), l = knownSwings(s.lows, j - 1, 2);
    if (h.length < 2 || l.length < 2) continue;
    const c = s.rows[j].close, pc = s.rows[j - 1].close;
    if (h[1].price < h[0].price && c > h[1].price && pc <= h[1].price)
      return { ...none, dir: 1, weight: WEIGHTS.mss15m, detail: `Close above lower-high ${h[1].price.toFixed(2)} ${back} bars ago` };
    if (l[1].price > l[0].price && c < l[1].price && pc >= l[1].price)
      return { ...none, dir: -1, weight: WEIGHTS.mss15m, detail: `Close below higher-low ${l[1].price.toFixed(2)} ${back} bars ago` };
  }
  return none;
}

/** Liquidity sweep: wick through a known swing then close back inside. Returns the sweep extreme. */
function sweep(s: TfSeries, k: number, bars: number): { dir: Dir; extreme: number; level: number } {
  for (let back = 0; back < bars; back++) {
    const j = k - back;
    if (j < 1) break;
    const r = s.rows[j];
    const l = knownSwings(s.lows, j - 1, 1)[0], h = knownSwings(s.highs, j - 1, 1)[0];
    if (l && r.low < l.price && r.close > l.price) return { dir: 1, extreme: r.low, level: l.price };
    if (h && r.high > h.price && r.close < h.price) return { dir: -1, extreme: r.high, level: h.price };
  }
  return { dir: 0, extreme: NaN, level: NaN };
}

function activeFvg(s: TfSeries, k: number, price: number, atr: number): Dir {
  for (let f = s.fvgs.length - 1; f >= 0; f--) {
    const g = s.fvgs[f];
    if (g.i > k) continue;
    if (k - g.i > 60) break;
    let filled = false;
    for (let j = g.i + 1; j <= k && !filled; j++) filled = g.type === "BULLISH" ? s.rows[j].low <= g.low : s.rows[j].high >= g.high;
    if (filled) continue;
    if (price >= g.low - 0.25 * atr && price <= g.high + 0.25 * atr) return g.type === "BULLISH" ? 1 : -1;
  }
  return 0;
}

function zoneDir(s: TfSeries, k: number, price: number): Dir {
  const a = s.rows[k].atr14;
  for (let z = s.zones.length - 1; z >= 0; z--) {
    const q = s.zones[z];
    if (q.confirm > k) continue;
    if (k - q.i > 150) break;
    if (price >= q.low - 0.5 * a && price <= q.high + 0.5 * a) return q.type === "DEMAND" ? 1 : -1;
  }
  return 0;
}

const candleDir = (r: FeatureRow): Dir => (r.bullEngulf || r.bullPin ? 1 : r.bearEngulf || r.bearPin ? -1 : 0);

export function requiredFramesMissing(S: SeriesSet): string[] {
  return (["15m", "1h", "4h"] as const).filter((tf) => !S[tf] || S[tf]!.rows.length < 60);
}

/** Evaluates the strategy at time T using only candles closed by T. */
export function evaluateAt(S: SeriesSet, T: number): Signal | null {
  const h4 = S["4h"], m15 = S["15m"], h1 = S["1h"];
  if (!h4 || !m15 || !h1) return null;
  const k4 = closedIndexAt(h4, T), k15 = closedIndexAt(m15, T), k1 = closedIndexAt(h1, T);
  if (k4 < 55 || k15 < 60 || k1 < 30) return null;
  const r15 = m15.rows[k15];
  const price = r15.close;
  const atr = r15.atr14;
  if (!Number.isFinite(atr) || atr <= 0) return null;

  const comps: Component[] = [trend4h(h4, k4), mss15(m15, k15)];

  const sw15 = sweep(m15, k15, 8);
  const m5 = S["5m"], k5 = m5 ? closedIndexAt(m5, T) : -1;
  const sw5 = m5 && k5 > 30 ? sweep(m5, k5, 12) : { dir: 0 as Dir, extreme: NaN, level: NaN };
  const sw = sw15.dir ? sw15 : sw5;
  comps.push({ id: "sweep", label: "Liquidity sweep", dir: sw.dir, weight: sw15.dir ? WEIGHTS.sweep : sw5.dir ? WEIGHTS.sweep / 2 : 0,
    detail: sw.dir ? `${sw15.dir ? "15m" : "5m"} swept ${sw.level.toFixed(2)} and closed back` : "None recent" });

  const f15 = activeFvg(m15, k15, price, atr);
  const f5 = m5 && k5 > 30 ? activeFvg(m5, k5, price, m5.rows[k5].atr14) : 0;
  const fd = f15 || f5;
  comps.push({ id: "fvg", label: "Fair value gap", dir: fd, weight: fd ? WEIGHTS.fvg : 0, detail: fd ? `Price at unfilled ${f15 ? "15m" : "5m"} ${fd > 0 ? "bullish" : "bearish"} FVG` : "Not at an FVG" });

  const zd = zoneDir(h1, k1, price);
  comps.push({ id: "supplyDemand", label: "Supply / demand (1H)", dir: zd, weight: zd ? WEIGHTS.supplyDemand : 0, detail: zd ? `At 1H ${zd > 0 ? "demand" : "supply"} zone` : "Not at a zone" });

  const m1 = S["1m"], k1m = m1 ? closedIndexAt(m1, T) : -1;
  const cd5 = m5 && k5 >= 0 ? candleDir(m5.rows[k5]) : 0;
  const cd = cd5 || (m1 && k1m >= 0 ? candleDir(m1.rows[k1m]) : 0) || candleDir(r15);
  comps.push({ id: "candle", label: "Candle pattern", dir: cd, weight: cd ? WEIGHTS.candle : 0, detail: cd ? `${cd > 0 ? "Bullish" : "Bearish"} rejection / engulfing` : "None" });

  const score = comps.reduce((s, c) => s + c.dir * c.weight, 0);
  const dir = sgn(score);
  const trend = comps[0].dir;
  const trigger = comps[1].dir === dir || comps[2].dir === dir;

  let reasonNoSetup: string | null = null;
  if (Math.abs(score) < SETUP_MIN_SCORE) reasonNoSetup = `Confluence score ${score.toFixed(1)} is below ±${SETUP_MIN_SCORE}.`;
  else if (trend === -dir) reasonNoSetup = "Signal is against the 4H trend.";
  else if (!trigger) reasonNoSetup = "No 15m structure shift or liquidity sweep to trigger an entry.";

  let plan: StrategyPlan | null = null;
  if (!reasonNoSetup && dir !== 0) {
    const swingList = dir > 0 ? knownSwings(m15.lows, k15, 1) : knownSwings(m15.highs, k15, 1);
    const ref = [sw.dir === dir ? sw.extreme : NaN, swingList[0]?.price ?? NaN].filter(Number.isFinite);
    const structural = dir > 0 ? Math.min(...ref, price - 0.5 * atr) - 0.2 * atr : Math.max(...ref, price + 0.5 * atr) + 0.2 * atr;
    const risk = Math.abs(price - structural);
    if (risk > 3 * atr) reasonNoSetup = "Structural stop is too far (> 3 ATR) — poor risk.";
    else {
      const opp = dir > 0 ? knownSwings(m15.highs, k15, 10).map((x) => x.price).filter((p) => p > price) : knownSwings(m15.lows, k15, 10).map((x) => x.price).filter((p) => p < price);
      const liq = opp.length ? (dir > 0 ? Math.min(...opp) : Math.max(...opp)) : NaN;
      const dist = Number.isFinite(liq) ? Math.min(Math.max(Math.abs(liq - price), risk), 2.5 * risk) : 1.5 * risk;
      const tp1 = price + dir * dist, tp2 = price + dir * Math.max(dist, 2 * risk), tp3 = price + dir * Math.max(dist, 3 * risk);
      plan = {
        direction: dir > 0 ? "BUY" : "SELL", entry: price, entryLow: price - 0.15 * atr, entryHigh: price + 0.15 * atr,
        stop: structural, tp1, tp2, tp3,
        rr: [Math.abs(tp1 - price) / risk, Math.abs(tp2 - price) / risk, Math.abs(tp3 - price) / risk], invalidation: structural,
      };
    }
  }
  return { t: T, price, atr15: atr, score, components: comps, setup: !!plan, plan, reasonNoSetup };
}
