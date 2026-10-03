import type { Candle, FeatureRow, Fvg, LiquidityPool, Regime, Swing, Zone } from "./types";

function ema(values: number[], span: number): number[] {
  const k = 2 / (span + 1);
  const out: number[] = [];
  values.forEach((v, i) => out.push(i === 0 ? v : v * k + out[i - 1] * (1 - k)));
  return out;
}

export function addFeatures(c: Candle[]): FeatureRow[] {
  const closes = c.map((x) => x.close);
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const e200 = ema(closes, 200);
  const tr = c.map((x, i) =>
    i === 0
      ? x.high - x.low
      : Math.max(x.high - x.low, Math.abs(x.high - c[i - 1].close), Math.abs(x.low - c[i - 1].close)),
  );
  let sum = 0;
  return c.map((x, i) => {
    sum += tr[i];
    if (i >= 14) sum -= tr[i - 14];
    const atr14 = i >= 13 ? sum / 14 : NaN;
    const range = x.high - x.low;
    const body = Math.abs(x.close - x.open);
    const upperWick = x.high - Math.max(x.open, x.close);
    const lowerWick = Math.min(x.open, x.close) - x.low;
    const p = c[i - 1];
    const bullEngulf = !!p && x.close > x.open && p.close < p.open && x.close >= p.open && x.open <= p.close;
    const bearEngulf = !!p && x.close < x.open && p.close > p.open && x.open >= p.close && x.close <= p.open;
    const bullPin = body > 0 && lowerWick >= 2 * body && upperWick <= range * 0.35 && x.close > x.open;
    const bearPin = body > 0 && upperWick >= 2 * body && lowerWick <= range * 0.35 && x.close < x.open;
    return {
      ...x, atr14, ema20: e20[i], ema50: e50[i], ema200: e200[i],
      range, body, upperWick, lowerWick, bullEngulf, bearEngulf, bullPin, bearPin,
    };
  });
}

export function swings(x: Candle[], left = 3, right = 3): { highs: Swing[]; lows: Swing[] } {
  const highs: Swing[] = [];
  const lows: Swing[] = [];
  for (let i = left; i < x.length - right; i++) {
    let maxH = -Infinity, minL = Infinity;
    for (let j = i - left; j <= i + right; j++) {
      maxH = Math.max(maxH, x[j].high);
      minL = Math.min(minL, x[j].low);
    }
    if (x[i].high === maxH) highs.push({ i, price: x[i].high, t: x[i].t });
    if (x[i].low === minL) lows.push({ i, price: x[i].low, t: x[i].t });
  }
  return { highs, lows };
}

export function structureState(x: FeatureRow[]) {
  const { highs, lows } = swings(x);
  let state = "UNKNOWN";
  let bos: string | null = null;
  if (highs.length >= 2 && lows.length >= 2) {
    const [h1, h2] = [highs[highs.length - 2].price, highs[highs.length - 1].price];
    const [l1, l2] = [lows[lows.length - 2].price, lows[lows.length - 1].price];
    if (h2 > h1 && l2 > l1) state = "BULLISH";
    else if (h2 < h1 && l2 < l1) state = "BEARISH";
    else state = "TRANSITIONAL";
    const last = x[x.length - 1].close;
    if (h2 < last) bos = "BULLISH";
    else if (l2 > last) bos = "BEARISH";
  }
  return { state, bos };
}

export function fvgZones(df: FeatureRow[], lookback = 250): Fvg[] {
  const x = df.slice(-lookback);
  const out: Fvg[] = [];
  for (let i = 2; i < x.length; i++) {
    if (x[i].low > x[i - 2].high) out.push({ type: "BULLISH", low: x[i - 2].high, high: x[i].low });
    else if (x[i].high < x[i - 2].low) out.push({ type: "BEARISH", low: x[i].high, high: x[i - 2].low });
  }
  return out.slice(-20);
}

function lastAtr(x: FeatureRow[]): number {
  const a = x[x.length - 1].atr14;
  if (Number.isFinite(a)) return a;
  const t = x.slice(-14);
  return t.reduce((s, r) => s + r.range, 0) / t.length;
}

export function liquidityLevels(x: FeatureRow[], tolAtr = 0.12): LiquidityPool[] {
  const tol = Math.max(lastAtr(x) * tolAtr, 0.01);
  const { highs, lows } = swings(x);
  const pools: LiquidityPool[] = [];
  for (const [arr, type] of [[highs, "BUY_SIDE"], [lows, "SELL_SIDE"]] as const) {
    const r = arr.slice(-30);
    for (let i = 0; i < r.length; i++)
      for (let j = i + 1; j < r.length; j++)
        if (Math.abs(r[i].price - r[j].price) <= tol)
          pools.push({ type, price: Math.round(((r[i].price + r[j].price) / 2) * 1e4) / 1e4 });
  }
  return pools.slice(-12);
}

export function zoneCandidates(df: FeatureRow[]): { demand: Zone[]; supply: Zone[] } {
  const x = df.slice(-200);
  const a = lastAtr(x);
  const demand: Zone[] = [];
  const supply: Zone[] = [];
  for (let i = 3; i < x.length - 3; i++) {
    const impulse = x[i + 1].body + x[i + 2].body + x[i + 3].body;
    if (x[i].range <= 1.25 * a && impulse >= 1.8 * a) {
      const score = Math.min(100, 50 + (impulse / Math.max(a, 1e-9)) * 10);
      if (x[i + 3].close > x[i].high) demand.push({ low: x[i].low, high: x[i].high, score, kind: "DEMAND" });
      else if (x[i + 3].close < x[i].low) supply.push({ low: x[i].low, high: x[i].high, score, kind: "SUPPLY" });
    }
  }
  return { demand: demand.slice(-8), supply: supply.slice(-8) };
}

export function regime(df: FeatureRow[]): Regime {
  const last = df[df.length - 1];
  if (!Number.isFinite(last.atr14)) return "UNKNOWN";
  const recent = df.slice(-40);
  const slope = recent[recent.length - 1].ema20 - recent[0].ema20;
  const atrs = recent.map((r) => r.atr14).filter(Number.isFinite).sort((a, b) => a - b);
  const m = atrs.length;
  const med = m % 2 ? atrs[(m - 1) / 2] : (atrs[m / 2 - 1] + atrs[m / 2]) / 2;
  if (last.atr14 > med * 1.8) return "HIGH-VOLATILITY";
  if (Math.abs(slope) > last.atr14 * 1.5) return "TRENDING";
  return "RANGING";
}

export function sessionLabel(t: number): string {
  const h = new Date(t).getUTCHours();
  if (h < 7) return "Asia";
  if (h < 12) return "London";
  if (h < 17) return "London / New York overlap";
  return "New York";
}
