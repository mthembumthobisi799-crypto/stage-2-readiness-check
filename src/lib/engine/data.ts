import type { Candle, DataQuality } from "./types";

export const TIMEFRAMES = {
  "1m": 1, "5m": 5, "15m": 15, "30m": 30, "1h": 60, "4h": 240, "1D": 1440,
} as const;
export type Timeframe = keyof typeof TIMEFRAMES;

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Synthetic 5-minute data for exploring the app. Not real market data. */
export function demoData(n = 1200, seed = 7, endMs = Date.UTC(2026, 0, 2, 16, 0)): Candle[] {
  const rnd = mulberry32(seed);
  const normal = (mu: number, sd: number) => {
    const u = Math.max(rnd(), 1e-12), v = rnd();
    return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const close: number[] = [];
  let level = 2350;
  for (let i = 0; i < n; i++) {
    level += normal(0, 0.12) + Math.sin(i / 85) * 0.035;
    close.push(level);
  }
  for (const [center, mag] of [[250, 18], [520, -22], [760, 25], [980, -16]]) {
    for (let i = Math.max(0, center - 18); i < Math.min(n, center + 18); i++)
      close[i] += mag * Math.exp(-(((i - center) / 18) ** 2));
  }
  const step = 5 * 60_000;
  return close.map((c, i) => {
    const o = i === 0 ? c : close[i - 1];
    const s = Math.abs(normal(1.2, 0.35)) + 0.15;
    return { t: endMs - (n - 1 - i) * step, open: o, high: Math.max(o, c) + s, low: Math.min(o, c) - s, close: c, volume: Math.exp(normal(8.5, 0.25)) };
  });
}

function parseTime(v: string): number {
  const s = v.trim();
  if (/^\d{10}$/.test(s)) return Number(s) * 1000;
  if (/^\d{13}$/.test(s)) return Number(s);
  // Treat timezone-less timestamps as UTC.
  const iso = s.replace(" ", "T");
  return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + "Z");
}

export interface ParseResult { candles: Candle[]; invalidRows: number; duplicates: number }

/** Parses CSV with columns timestamp/datetime/date, open, high, low, close, [volume]. */
export function parseCsv(text: string): ParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error("The file is empty.");
  const sep = lines[0].includes(";") && !lines[0].includes(",") ? ";" : lines[0].includes("\t") ? "\t" : ",";
  const head = lines[0].split(sep).map((h) => h.trim().toLowerCase().replace(/[<>"]/g, ""));
  const idx = (names: string[]) => head.findIndex((h) => names.includes(h));
  const ti = idx(["timestamp", "datetime", "date", "time", "date_time"]);
  const cols = { open: idx(["open", "o"]), high: idx(["high", "h"]), low: idx(["low", "l"]), close: idx(["close", "c"]), volume: idx(["volume", "vol", "tickvol", "v"]) };
  const missing = [ti < 0 && "timestamp", ...(["open", "high", "low", "close"] as const).filter((k) => cols[k] < 0)].filter(Boolean);
  if (missing.length) throw new Error(`Missing required columns: ${missing.join(", ")}`);
  const map = new Map<number, Candle>();
  let invalidRows = 0, duplicates = 0;
  for (const line of lines.slice(1)) {
    const f = line.split(sep).map((x) => x.trim().replace(/"/g, ""));
    const t = parseTime(f[ti] ?? "");
    const c: Candle = { t, open: +f[cols.open], high: +f[cols.high], low: +f[cols.low], close: +f[cols.close], volume: cols.volume >= 0 ? +f[cols.volume] : undefined };
    const ok = Number.isFinite(t) && [c.open, c.high, c.low, c.close].every(Number.isFinite) && c.high >= Math.max(c.open, c.close) && c.low <= Math.min(c.open, c.close);
    if (!ok) { invalidRows++; continue; }
    if (map.has(t)) duplicates++;
    map.set(t, c);
  }
  const candles = [...map.values()].sort((a, b) => a.t - b.t);
  if (candles.length < 50) throw new Error("At least 50 valid candles are required.");
  return { candles, invalidRows, duplicates };
}

export function detectTimeframeMinutes(c: Candle[]): number {
  const d: number[] = [];
  for (let i = 1; i < Math.min(c.length, 500); i++) d.push(c[i].t - c[i - 1].t);
  d.sort((a, b) => a - b);
  return Math.round((d[Math.floor(d.length / 2)] ?? 0) / 60_000);
}

/** Aggregates finer candles into a coarser timeframe (UTC-aligned buckets). */
export function resample(c: Candle[], minutes: number): Candle[] {
  const ms = minutes * 60_000;
  const out: Candle[] = [];
  for (const x of c) {
    const b = Math.floor(x.t / ms) * ms;
    const last = out[out.length - 1];
    if (last && last.t === b) {
      last.high = Math.max(last.high, x.high);
      last.low = Math.min(last.low, x.low);
      last.close = x.close;
      if (x.volume !== undefined) last.volume = (last.volume ?? 0) + x.volume;
    } else out.push({ ...x, t: b });
  }
  return out;
}

export function assessQuality(c: Candle[], invalidRows = 0, duplicates = 0): DataQuality {
  const tf = detectTimeframeMinutes(c) * 60_000;
  let gaps = 0;
  for (let i = 1; i < c.length; i++) {
    const d = c[i].t - c[i - 1].t;
    // Ignore normal weekend closures (> 40h).
    if (tf > 0 && d > tf * 1.5 && d < 40 * 3600_000) gaps++;
  }
  const notes: string[] = [];
  if (c.length < 300) notes.push("Fewer than 300 candles — longer-term structure is unreliable.");
  if (gaps) notes.push(`${gaps} unexpected gaps in the candle sequence.`);
  if (invalidRows) notes.push(`${invalidRows} rows were rejected as invalid.`);
  if (duplicates) notes.push(`${duplicates} duplicate timestamps were merged.`);
  const gapRatio = gaps / Math.max(c.length, 1);
  const status = c.length < 100 || gapRatio > 0.05 ? "POOR" : c.length < 300 || gapRatio > 0.01 || invalidRows > 0 ? "FAIR" : "GOOD";
  return { status, candles: c.length, gaps, invalidRows, duplicates, notes };
}
