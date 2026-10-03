import { analyze } from "./analysis";
import { assessQuality } from "./data";
import type { Candle, Confidence, NewsRisk } from "./types";

export type Outcome = "WIN" | "LOSS" | "AMBIGUOUS_SL_FIRST" | "TIMEOUT";
export type TargetChoice = "TP1" | "TP2" | "TP3" | "2R";

export interface Trade {
  decisionTime: number; entryTime: number; exitTime: number;
  side: "BUY" | "SELL"; entry: number; stop: number; target: number;
  outcome: Outcome; R: number; confidence: Confidence; regime: string; amdPhase: string;
}

export function outcomeAfter(c: Candle[], start: number, side: "BUY" | "SELL", entry: number, stop: number, target: number, maxBars: number): [Outcome, number, number] {
  const end = Math.min(c.length - 1, start + maxBars);
  const risk = Math.abs(entry - stop);
  // The entry candle itself can also hit levels after the open.
  for (let j = start; j <= end; j++) {
    const hitSl = side === "BUY" ? c[j].low <= stop : c[j].high >= stop;
    const hitTp = side === "BUY" ? c[j].high >= target : c[j].low <= target;
    // OHLC cannot tell which came first: assume the stop (conservative).
    if (hitSl && hitTp) return ["AMBIGUOUS_SL_FIRST", j, -1];
    if (hitSl) return ["LOSS", j, -1];
    if (hitTp) return ["WIN", j, risk ? Math.abs(target - entry) / risk : 0];
  }
  // Timeout: mark-to-market at the final close, in R.
  const exit = c[end].close;
  const r = risk ? ((side === "BUY" ? exit - entry : entry - exit) / risk) : 0;
  return ["TIMEOUT", end, r];
}

export interface BacktestOptions {
  warmup?: number; step?: number; maxHoldingBars?: number;
  minConfidence?: Confidence; target?: TargetChoice; news?: NewsRisk;
}

const RANK: Record<string, number> = { "No Trade": -1, Weak: 0, Moderate: 1, Strong: 2, "Very Strong": 3 };

/**
 * Walk-forward backtest. For decision candle i the engine sees ONLY candles[0..i].
 * Entry is the next candle's open; future candles are used only to score the outcome.
 */
export function runBacktest(c: Candle[], o: BacktestOptions = {}, onProgress?: (p: number) => void): Trade[] {
  const { warmup = 250, step = 5, maxHoldingBars = 60, minConfidence = "Moderate", target = "TP2", news } = o;
  const trades: Trade[] = [];
  if (c.length <= warmup + step) return trades;
  const quality = assessQuality(c); // dataset-level quality only, not future prices
  let busyUntil = -1;
  for (let i = warmup; i < c.length - 1; i += step) {
    onProgress?.(i / c.length);
    if (i <= busyUntil) continue; // one position at a time
    const res = analyze(c.slice(0, i + 1), { news, quality });
    if (!res.plan || (res.decision !== "BUY" && res.decision !== "SELL")) continue;
    if ((RANK[res.confidence] ?? -1) < RANK[minConfidence]) continue;
    const p = res.plan;
    const entry = c[i + 1].open;
    const risk = Math.abs(p.entry - p.stop);
    if (risk <= 0) continue;
    const sgn = p.direction === "BUY" ? 1 : -1;
    const stop = entry - sgn * risk;
    const dist = target === "2R" ? 2 * risk : Math.abs((target === "TP1" ? p.tp1 : target === "TP2" ? p.tp2 : p.tp3) - p.entry);
    const tgt = entry + sgn * dist;
    const [outcome, exitIdx, R] = outcomeAfter(c, i + 1, p.direction, entry, stop, tgt, maxHoldingBars);
    busyUntil = exitIdx;
    trades.push({
      decisionTime: c[i].t, entryTime: c[i + 1].t, exitTime: c[exitIdx].t, side: p.direction,
      entry, stop, target: tgt, outcome, R, confidence: res.confidence, regime: res.regime, amdPhase: res.amd.phase,
    });
  }
  onProgress?.(1);
  return trades;
}

export function performanceReport(t: Trade[]) {
  if (!t.length) return null;
  const r = t.map((x) => x.R);
  const wins = r.filter((v) => v > 0), losses = r.filter((v) => v < 0);
  let eq = 0, peak = 0, dd = 0, streak = 0, maxStreak = 0;
  const equity = r.map((v) => {
    eq += v; peak = Math.max(peak, eq); dd = Math.min(dd, eq - peak);
    streak = v < 0 ? streak + 1 : 0; maxStreak = Math.max(maxStreak, streak);
    return eq;
  });
  const lossSum = Math.abs(losses.reduce((s, v) => s + v, 0));
  const total = r.reduce((s, v) => s + v, 0);
  const group = (k: "regime" | "amdPhase") => {
    const m: Record<string, { trades: number; totalR: number; wins: number }> = {};
    t.forEach((x) => { const g = (m[x[k]] ??= { trades: 0, totalR: 0, wins: 0 }); g.trades++; g.totalR += x.R; if (x.R > 0) g.wins++; });
    return m;
  };
  return {
    trades: t.length, wins: wins.length, losses: losses.length,
    timeouts: t.filter((x) => x.outcome === "TIMEOUT").length,
    ambiguous: t.filter((x) => x.outcome === "AMBIGUOUS_SL_FIRST").length,
    winRate: wins.length / t.length, expectancyR: total / t.length, totalR: total,
    profitFactor: lossSum ? wins.reduce((s, v) => s + v, 0) / lossSum : Infinity,
    maxDrawdownR: dd, maxConsecutiveLosses: maxStreak, equity,
    byRegime: group("regime"), byAmd: group("amdPhase"),
  };
}

export function splitWalkForward<T>(c: T[], train = 0.6, validation = 0.2) {
  const a = Math.floor(c.length * train), b = Math.floor(c.length * (train + validation));
  return { train: c.slice(0, a), validation: c.slice(a, b), test: c.slice(b) };
}
