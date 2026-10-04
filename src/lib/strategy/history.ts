import type { Confidence, Decision, NewsRisk } from "../engine/types";
import { evaluateAt, requiredFramesMissing, type Signal } from "./engine";
import type { SeriesSet } from "./series";

export type Move = "UP" | "DOWN" | "RANGE";
export type SetupOutcome = { hitTp1: boolean; hitTp2: boolean; hitTp3: boolean; R2: number };

export interface HistoryCase {
  t: number;
  resolvedAt: number; // time at which the outcome was fully known
  score: number;
  bucket: number;
  move: Move;
  setupDir: 0 | 1 | -1;
  setup: SetupOutcome | null;
}

export const HORIZON_BARS = 32; // 8 hours on 15m
export const MOVE_ATR = 1.0;

export function bucketOf(score: number): number {
  return score <= -6 ? -2 : score <= -2 ? -1 : score < 2 ? 0 : score < 6 ? 1 : 2;
}
export const BUCKET_LABEL: Record<number, string> = { [-2]: "strong bearish", [-1]: "bearish", 0: "neutral", 1: "bullish", 2: "strong bullish" };

/**
 * Walks forward through every closed 15m candle, evaluates the strategy with only past data,
 * then records what actually happened over the next HORIZON_BARS candles.
 * Ambiguous candles (both levels touched) are treated conservatively.
 */
export function buildHistory(S: SeriesSet, step = 1): HistoryCase[] {
  const m15 = S["15m"];
  if (!m15) return [];
  const rows = m15.rows;
  const out: HistoryCase[] = [];
  for (let k = 60; k < rows.length - 1; k += step) {
    const T = rows[k].t + m15.ms;
    const sig = evaluateAt(S, T);
    if (!sig) continue;
    const end = Math.min(rows.length - 1, k + HORIZON_BARS);
    if (end - k < HORIZON_BARS) break; // outcome not yet known
    const up = sig.price + MOVE_ATR * sig.atr15, dn = sig.price - MOVE_ATR * sig.atr15;
    let move: Move = "RANGE";
    for (let j = k + 1; j <= end; j++) {
      const hu = rows[j].high >= up, hd = rows[j].low <= dn;
      if (hu && hd) { move = "RANGE"; break; }
      if (hu) { move = "UP"; break; }
      if (hd) { move = "DOWN"; break; }
    }
    let setup: SetupOutcome | null = null;
    let resolvedAt = rows[end].t + m15.ms;
    if (sig.plan) {
      setup = scoreSetup(sig, rows, k, end);
    }
    out.push({ t: T, resolvedAt, score: sig.score, bucket: bucketOf(sig.score), move, setupDir: sig.plan ? (sig.plan.direction === "BUY" ? 1 : -1) : 0, setup });
    resolvedAt = 0;
  }
  return out;
}

function scoreSetup(sig: Signal, rows: { high: number; low: number; close: number }[], k: number, end: number): SetupOutcome {
  const p = sig.plan!;
  const d = p.direction === "BUY" ? 1 : -1;
  const risk = Math.abs(p.entry - p.stop);
  const hit = { 1: false, 2: false, 3: false };
  let stopped = false, R2: number | null = null;
  for (let j = k + 1; j <= end && !stopped; j++) {
    const r = rows[j];
    const sl = d > 0 ? r.low <= p.stop : r.high >= p.stop;
    const reach = (tp: number) => (d > 0 ? r.high >= tp : r.low <= tp);
    // Conservative: if the stop is touched in the same candle, the stop counts first.
    if (sl) { stopped = true; if (R2 === null) R2 = -1; break; }
    if (reach(p.tp1)) hit[1] = true;
    if (reach(p.tp2)) { hit[2] = true; if (R2 === null) R2 = p.rr[1]; }
    if (reach(p.tp3)) hit[3] = true;
  }
  if (R2 === null) R2 = (d * (rows[end].close - p.entry)) / risk;
  return { hitTp1: hit[1], hitTp2: hit[2], hitTp3: hit[3], R2 };
}

export interface Estimate {
  n: number;
  bullish: number; bearish: number; range: number;
  basis: string;
  setup: { n: number; tp1: number; tp2: number; tp3: number; expectancyR: number } | null;
}

const MIN_CASES = 20;

/** Empirical estimate from past cases whose outcomes were already known at time T. */
export function estimate(history: HistoryCase[], sig: Signal, T: number): Estimate {
  const known = history.filter((h) => h.resolvedAt <= T);
  const b = bucketOf(sig.score);
  let pool = known.filter((h) => h.bucket === b);
  let basis = `${pool.length} past cases with a ${BUCKET_LABEL[b]} confluence score`;
  if (pool.length < MIN_CASES) {
    pool = known.filter((h) => Math.sign(h.bucket) === Math.sign(b));
    basis = `${pool.length} past cases leaning the same way (too few exact matches)`;
  }
  const c = { UP: 1, DOWN: 1, RANGE: 1 }; // Laplace smoothing
  pool.forEach((h) => c[h.move]++);
  const tot = c.UP + c.DOWN + c.RANGE;
  let setup: Estimate["setup"] = null;
  if (sig.plan) {
    const d = sig.plan.direction === "BUY" ? 1 : -1;
    const ss = known.filter((h) => h.setupDir === d && h.setup);
    if (ss.length) {
      setup = {
        n: ss.length,
        tp1: ss.filter((h) => h.setup!.hitTp1).length / ss.length,
        tp2: ss.filter((h) => h.setup!.hitTp2).length / ss.length,
        tp3: ss.filter((h) => h.setup!.hitTp3).length / ss.length,
        expectancyR: ss.reduce((s, h) => s + h.setup!.R2, 0) / ss.length,
      };
    }
  }
  return { n: pool.length, bullish: c.UP / tot, bearish: c.DOWN / tot, range: c.RANGE / tot, basis, setup };
}

export interface StrategyDecision {
  decision: Decision;
  confidence: Confidence;
  reasoning: string;
  signal: Signal | null;
  estimate: Estimate | null;
}

export function decide(S: SeriesSet, history: HistoryCase[], T: number, news: NewsRisk): StrategyDecision {
  const missing = requiredFramesMissing(S);
  if (missing.length) return { decision: "UNCERTAIN", confidence: "No Trade", reasoning: `Not enough ${missing.join(", ")} history.`, signal: null, estimate: null };
  const sig = evaluateAt(S, T);
  if (!sig) return { decision: "UNCERTAIN", confidence: "No Trade", reasoning: "Not enough closed candles on every timeframe yet.", signal: null, estimate: null };
  const est = estimate(history, sig, T);
  const base = { signal: sig, estimate: est };
  if (est.n < MIN_CASES) return { ...base, decision: "UNCERTAIN", confidence: "No Trade", reasoning: `Only ${est.n} comparable past cases — too few to estimate probabilities. Load more history.` };
  if (news.level === "VERY HIGH") return { ...base, decision: "NO TRADE", confidence: "No Trade", reasoning: `High-impact news (${news.event}) is imminent.` };
  if (!sig.plan) {
    const ranging = est.range > Math.max(est.bullish, est.bearish) && est.range > 0.5;
    return { ...base, decision: ranging ? "NO TRADE" : "WAIT", confidence: ranging ? "No Trade" : "Weak", reasoning: `${sig.reasonNoSetup ?? "No setup."}${ranging ? " History shows mostly ranging behaviour in this state." : ""}` };
  }
  const d = sig.plan.direction === "BUY" ? 1 : -1;
  const pFor = d > 0 ? est.bullish : est.bearish, pAgainst = d > 0 ? est.bearish : est.bullish;
  const edge = pFor - pAgainst;
  const st = est.setup;
  if (edge < 0.08) return { ...base, decision: "WAIT", confidence: "Weak", reasoning: `Setup found, but history shows no clear edge (${(pFor * 100).toFixed(0)}% for vs ${(pAgainst * 100).toFixed(0)}% against).` };
  if (st && st.n >= 10 && st.expectancyR <= 0) return { ...base, decision: "WAIT", confidence: "Weak", reasoning: `Setup found, but past setups like this averaged ${st.expectancyR.toFixed(2)}R — negative.` };
  let confidence: Confidence = pFor >= 0.6 && est.n >= 50 ? "Very Strong" : pFor >= 0.52 ? "Strong" : pFor >= 0.45 ? "Moderate" : "Weak";
  if (news.level === "HIGH" && (confidence === "Very Strong" || confidence === "Strong")) confidence = "Moderate";
  if (!st || st.n < 10) confidence = confidence === "Very Strong" ? "Strong" : confidence;
  return {
    ...base, decision: d > 0 ? "BUY" : "SELL", confidence,
    reasoning: `${d > 0 ? "Bullish" : "Bearish"} setup (score ${sig.score.toFixed(1)}). In ${est.n} similar past cases price moved 1 ATR ${d > 0 ? "up" : "down"} first ${(pFor * 100).toFixed(0)}% of the time vs ${(pAgainst * 100).toFixed(0)}% the other way.`,
  };
}
