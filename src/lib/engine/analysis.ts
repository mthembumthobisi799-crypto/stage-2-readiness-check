import { addFeatures, fvgZones, liquidityLevels, regime as getRegime, sessionLabel, structureState, zoneCandidates } from "./features";
import { assessQuality } from "./data";
import { NO_NEWS } from "./news";
import { rr } from "./risk";
import type { AmdState, AnalysisResult, Candle, Confidence, DataQuality, Decision, FeatureRow, TradePlan } from "./types";

export const WARNING =
  "Probabilities are heuristic model estimates, not calibrated or guaranteed. Research, education and paper trading only.";

const near = (p: number, lo: number, hi: number, a: number, m = 0.5) => lo - a * m <= p && p <= hi + a * m;

export function amdState(df: FeatureRow[]): AmdState {
  const x = df.slice(-72);
  if (x.length < 30) return { phase: "INCOMPLETE", reason: "Not enough candles for an AMD hypothesis." };
  const a = x[x.length - 1].atr14;
  if (!Number.isFinite(a) || a <= 0) return { phase: "INCOMPLETE", reason: "ATR unavailable." };
  const hiOf = (n: number) => Math.max(...x.slice(-n).map((r) => r.high));
  const loOf = (n: number) => Math.min(...x.slice(-n).map((r) => r.low));
  const hi = hiOf(36), lo = loOf(36);
  const last = x[x.length - 1].close;
  // Excursions are measured against the range BEFORE the last 8 candles so a sweep can exist.
  const prior = x.slice(-36, -8);
  const pHi = Math.max(...prior.map((r) => r.high)), pLo = Math.min(...prior.map((r) => r.low));
  if (hiOf(12) - loOf(12) < Math.max((hi - lo) * 0.45, 2 * a))
    return { phase: "ACCUMULATION", reason: "Recent range is contracting relative to the broader range." };
  if (hiOf(8) > pHi + 0.05 * a && last < pHi)
    return { phase: "MANIPULATION", direction: "BEARISH", reason: "Upside liquidity excursion followed by a close back inside the prior range." };
  if (loOf(8) < pLo - 0.05 * a && last > pLo)
    return { phase: "MANIPULATION", direction: "BULLISH", reason: "Downside liquidity excursion followed by a close back inside the prior range." };
  if (Math.abs(last - hi) < a * 0.4 || Math.abs(last - lo) < a * 0.4)
    return { phase: "INCOMPLETE", reason: "Price is near a range extreme; confirmation required." };
  return { phase: "NOT CONFIRMED", reason: "No clear AMD sequence in the available candles." };
}

function uncertain(reason: string, price: number, dq: DataQuality, news = NO_NEWS): AnalysisResult {
  return {
    decision: "UNCERTAIN", confidence: "No Trade", bias: "Neutral",
    probabilities: { bullish: 1 / 3, bearish: 1 / 3, range: 1 / 3 }, plan: null,
    reasoning: reason, evidenceFor: [], evidenceAgainst: [reason], regime: "UNKNOWN",
    session: "—", news, dataQuality: dq, amd: { phase: "INCOMPLETE", reason },
    structure: { state: "UNKNOWN", bos: null }, currentPrice: price,
    zones: { demand: [], supply: [] }, fvgs: [], liquidity: [], warning: WARNING,
  };
}

export interface AnalyzeOptions { news?: typeof NO_NEWS; quality?: DataQuality }

export function analyze(candles: Candle[], opts: AnalyzeOptions = {}): AnalysisResult {
  const news = opts.news ?? NO_NEWS;
  const dq = opts.quality ?? assessQuality(candles);
  const price = candles[candles.length - 1]?.close ?? NaN;
  if (candles.length < 60) return uncertain("Fewer than 60 candles — not enough history.", price, dq, news);
  if (dq.status === "POOR") return uncertain("Data quality is poor — fix gaps or load more history.", price, dq, news);

  const x = addFeatures(candles);
  const last = x[x.length - 1];
  const a = last.atr14;
  if (!Number.isFinite(a) || a <= 0) return uncertain("Volatility (ATR) is unavailable.", price, dq, news);

  const structure = structureState(x);
  const liq = liquidityLevels(x);
  const zones = zoneCandidates(x);
  const fvgs = fvgZones(x);
  const reg = getRegime(x);
  const amd = amdState(x);
  const session = sessionLabel(last.t);

  let bull = 0, bear = 0;
  const rb: string[] = [], rs: string[] = [];
  if (structure.state === "BULLISH") { bull += 2.5; rb.push("Swing structure is bullish (higher highs and higher lows)."); }
  else if (structure.state === "BEARISH") { bear += 2.5; rs.push("Swing structure is bearish (lower highs and lower lows)."); }
  else { bull += 0.5; bear += 0.5; }

  if (last.ema20 > last.ema50) { bull += 1; rb.push("EMA20 is above EMA50."); }
  else if (last.ema20 < last.ema50) { bear += 1; rs.push("EMA20 is below EMA50."); }

  if (zones.demand.slice(-5).some((z) => near(price, z.low, z.high, a))) { bull += 2; rb.push("Price is reacting at a demand zone."); }
  if (zones.supply.slice(-5).some((z) => near(price, z.low, z.high, a))) { bear += 2; rs.push("Price is reacting at a supply zone."); }

  for (const f of fvgs.slice(-8)) {
    if (!near(price, f.low, f.high, a, 0.25)) continue;
    if (f.type === "BULLISH") { bull += 1.25; rb.push("Price is near a bullish fair value gap."); }
    else { bear += 1.25; rs.push("Price is near a bearish fair value gap."); }
  }

  if (amd.phase === "MANIPULATION") {
    if (amd.direction === "BULLISH") { bull += 2; rb.push("AMD hypothesis: downside liquidity sweep was rejected."); }
    else { bear += 2; rs.push("AMD hypothesis: upside liquidity sweep was rejected."); }
  }
  if (last.bullEngulf || last.bullPin) { bull += 0.75; rb.push("Latest candle shows bullish rejection / engulfing."); }
  if (last.bearEngulf || last.bearPin) { bear += 0.75; rs.push("Latest candle shows bearish rejection / engulfing."); }

  if (reg === "HIGH-VOLATILITY") { bull *= 0.72; bear *= 0.72; }
  if (news.level === "VERY HIGH") { bull *= 0.65; bear *= 0.65; }
  else if (news.level === "HIGH") { bull *= 0.85; bear *= 0.85; }

  // V2 bug fix: V2's formula always produced a 0% ranging estimate. Ranging now gets
  // its own evidence score from regime, AMD accumulation and a weak structure.
  let rangeScore = 1;
  if (reg === "RANGING") rangeScore += 2;
  if (amd.phase === "ACCUMULATION") rangeScore += 1;
  if (structure.state === "TRANSITIONAL" || structure.state === "UNKNOWN") rangeScore += 1;
  const total = bull + bear + rangeScore + 2;
  const bp = (bull + 1) / total, sp = (bear + 1) / total;
  const rp = rangeScore / total;
  const top = Math.max(bp, sp);

  let decision: Decision;
  const blocked = reg === "HIGH-VOLATILITY" || news.level === "VERY HIGH";
  if (top < 0.52 || Math.abs(bp - sp) < 0.12) decision = blocked ? "NO TRADE" : "WAIT";
  else decision = blocked ? "NO TRADE" : bp > sp ? "BUY" : "SELL";

  const direction = bp > sp ? "BUY" : "SELL";
  const recent = x.slice(-30);
  let stop: number, tp1: number, tp2: number, tp3: number;
  if (direction === "BUY") {
    stop = Math.min(Math.min(...recent.map((r) => r.low)) - 0.15 * a, price - 0.8 * a);
    const risk = price - stop;
    const above = liq.filter((p) => p.type === "BUY_SIDE" && p.price > price).map((p) => p.price);
    const r1 = above.length ? Math.min(...above) : price + 1.2 * risk; // nearest resistance
    tp1 = Math.max(price + risk, Math.min(r1, price + 1.8 * risk));
    tp2 = Math.max(tp1, price + 2 * risk);
    tp3 = Math.max(tp2, price + 3 * risk);
  } else {
    stop = Math.max(Math.max(...recent.map((r) => r.high)) + 0.15 * a, price + 0.8 * a);
    const risk = stop - price;
    const below = liq.filter((p) => p.type === "SELL_SIDE" && p.price < price).map((p) => p.price);
    // V2 bug fix: nearest support is the HIGHEST level below price (V2 used the lowest).
    const s1 = below.length ? Math.max(...below) : price - 1.2 * risk;
    tp1 = Math.min(price - risk, Math.max(s1, price - 1.8 * risk));
    tp2 = Math.min(tp1, price - 2 * risk);
    tp3 = Math.min(tp2, price - 3 * risk);
  }
  const rrs = [tp1, tp2, tp3].map((t) => rr(price, stop, t, direction));
  let plan: TradePlan | null = null;
  if ((decision === "BUY" || decision === "SELL") && rrs.every((v) => v !== null)) {
    plan = {
      direction, entry: price, entryLow: price - 0.15 * a, entryHigh: price + 0.15 * a,
      stop, stopZoneLow: stop - 0.1 * a, stopZoneHigh: stop + 0.1 * a,
      tp1, tp2, tp3, rr: rrs as [number, number, number], invalidation: stop,
    };
  } else if (decision === "BUY" || decision === "SELL") decision = "WAIT";

  let confidence: Confidence =
    top >= 0.7 ? "Very Strong" : top >= 0.62 ? "Strong" : top >= 0.55 ? "Moderate" : "Weak";
  if (decision === "WAIT") confidence = top < 0.55 ? "Weak" : "Moderate";
  if (decision === "NO TRADE") confidence = "No Trade";
  if (dq.status === "FAIR" && confidence === "Very Strong") confidence = "Strong";

  const forDir = direction === "BUY" ? rb : rs;
  const against = direction === "BUY" ? rs : rb;
  if (amd.phase === "ACCUMULATION") against.push("AMD: still accumulating — no directional distribution confirmed.");
  if (reg === "HIGH-VOLATILITY") against.push("Volatility is unusually high — levels are less reliable.");
  if (news.level === "HIGH" || news.level === "VERY HIGH") against.push(`News risk ${news.level}: ${news.event}.`);
  if (news.level === "UNKNOWN") against.push("News risk unknown — no calendar connected.");
  if (dq.status !== "GOOD") against.push(`Data quality is ${dq.status.toLowerCase()}.`);

  const lean = direction === "BUY" ? "bullish" : "bearish";
  const reasoning =
    decision === "BUY" || decision === "SELL"
      ? `Evidence leans ${lean} (${(top * 100).toFixed(0)}% estimated) in a ${reg.toLowerCase()} market with ${forDir.length} supporting and ${against.length} conflicting factors.`
      : decision === "NO TRADE"
        ? `Conditions block a setup: ${reg === "HIGH-VOLATILITY" ? "volatility is extreme" : "a high-impact news release is imminent"}.`
        : `Evidence is not decisive (bullish ${(bp * 100).toFixed(0)}% vs bearish ${(sp * 100).toFixed(0)}%). Wait for clearer structure.`;

  return {
    decision, confidence,
    bias: bp > sp + 0.05 ? "Bullish" : sp > bp + 0.05 ? "Bearish" : "Neutral",
    probabilities: { bullish: bp, bearish: sp, range: rp }, plan, reasoning,
    evidenceFor: forDir, evidenceAgainst: against, regime: reg, session, news, dataQuality: dq,
    amd, structure, currentPrice: price, zones, fvgs, liquidity: liq, warning: WARNING,
  };
}
