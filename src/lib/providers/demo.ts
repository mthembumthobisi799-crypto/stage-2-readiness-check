import type { Candle } from "../engine/types";
import { buildFromBase } from "./aggregate";
import type { MarketDataProvider } from "./types";

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Synthetic 1-minute gold-like series with trending and ranging regimes. NOT real data. */
export function demo1m(days = 30, seed = 11, endMs = Date.UTC(2026, 0, 30, 0, 0)): Candle[] {
  const r = rng(seed);
  const n = days * 1440;
  const norm = () => Math.sqrt(-2 * Math.log(Math.max(r(), 1e-12))) * Math.cos(2 * Math.PI * r());
  const out: Candle[] = [];
  let price = 2350, drift = 0, regimeLeft = 0;
  for (let i = 0; i < n; i++) {
    if (regimeLeft-- <= 0) { drift = (r() - 0.5) * 0.06; regimeLeft = 600 + Math.floor(r() * 2400); }
    const o = price;
    const c = o + drift + norm() * 0.32;
    const w = Math.abs(norm()) * 0.18 + 0.05;
    out.push({ t: endMs - (n - i) * 60_000, open: o, high: Math.max(o, c) + w, low: Math.min(o, c) - w, close: c });
    price = c;
  }
  return out;
}

export const demoProvider: MarketDataProvider = {
  id: "demo",
  label: "Demo data (synthetic, 30 days of 1-minute)",
  async load() {
    const ds = buildFromBase(demo1m(), 1, this.label);
    ds.notes.unshift("Synthetic data — results say nothing about the real gold market.");
    return ds;
  },
};
