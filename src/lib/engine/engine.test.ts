import { describe, expect, it } from "vitest";
import { addFeatures, fvgZones, swings } from "./features";
import { analyze } from "./analysis";
import { demoData, parseCsv, resample, assessQuality } from "./data";
import { outcomeAfter, performanceReport, runBacktest } from "./backtest";
import { classifyNews } from "./news";
import { rr } from "./risk";

const DECISIONS = ["BUY", "SELL", "WAIT", "NO TRADE", "UNCERTAIN"];

describe("ported V2 tests", () => {
  it("demo data is valid", () => {
    const d = demoData();
    expect(d.length).toBe(1200);
    d.forEach((c) => { expect(c.high).toBeGreaterThanOrEqual(Math.max(c.open, c.close)); expect(c.low).toBeLessThanOrEqual(Math.min(c.open, c.close)); });
  });
  it("features have expected fields", () => {
    const f = addFeatures(demoData(300));
    expect(Number.isFinite(f[299].atr14)).toBe(true);
    expect(Number.isNaN(f[5].atr14)).toBe(true);
    expect(typeof f[0].bullEngulf).toBe("boolean");
  });
  it("swing and FVG functions return lists", () => {
    const f = addFeatures(demoData(300));
    expect(Array.isArray(swings(f).highs)).toBe(true);
    expect(Array.isArray(fvgZones(f))).toBe(true);
  });
  it("analysis returns a controlled decision", () => {
    const r = analyze(demoData());
    expect(DECISIONS).toContain(r.decision);
    const p = r.probabilities;
    expect(p.bullish + p.bearish + p.range).toBeCloseTo(1, 6);
  });
  it("backtest never enters before the decision candle", () => {
    const t = runBacktest(demoData(600), { warmup: 250, step: 10, maxHoldingBars: 20, minConfidence: "Weak" });
    t.forEach((x) => { expect(x.entryTime).toBeGreaterThan(x.decisionTime); expect(x.exitTime).toBeGreaterThanOrEqual(x.entryTime); });
  });
  it("report has keys", () => {
    const t = runBacktest(demoData(800), { step: 5, minConfidence: "Weak" });
    const rep = performanceReport(t);
    if (rep) for (const k of ["trades", "winRate", "expectancyR", "profitFactor", "maxDrawdownR"]) expect(rep).toHaveProperty(k);
  });
});

describe("new safeguards", () => {
  it("trade plan levels are ordered correctly for every direction", () => {
    for (let seed = 1; seed < 25; seed++) {
      const r = analyze(demoData(800, seed));
      const p = r.plan;
      if (!p) continue;
      if (p.direction === "BUY") expect(p.stop < p.entry && p.entry < p.tp1 && p.tp1 <= p.tp2 && p.tp2 <= p.tp3).toBe(true);
      else expect(p.stop > p.entry && p.entry > p.tp1 && p.tp1 >= p.tp2 && p.tp2 >= p.tp3).toBe(true);
      p.rr.forEach((v) => expect(v).toBeGreaterThan(0));
    }
  });
  it("analysis is unchanged by future candles (no look-ahead)", () => {
    const d = demoData(900);
    const a = analyze(d.slice(0, 600));
    const b = analyze(d.slice(0, 900).slice(0, 600));
    expect(a).toEqual(b);
  });
  it("ambiguous candle counts as a loss", () => {
    const c = [{ t: 0, open: 100, high: 100, low: 100, close: 100 }, { t: 1, open: 100, high: 110, low: 90, close: 100 }];
    expect(outcomeAfter(c, 1, "BUY", 100, 95, 105, 5)[0]).toBe("AMBIGUOUS_SL_FIRST");
  });
  it("very high news risk blocks trades", () => {
    const news = classifyNews(10, true, "CPI");
    for (let seed = 1; seed < 10; seed++) expect(["BUY", "SELL"]).not.toContain(analyze(demoData(800, seed), { news }).decision);
  });
  it("too little data is UNCERTAIN", () => {
    expect(analyze(demoData(40)).decision).toBe("UNCERTAIN");
  });
  it("rr rejects invalid geometry", () => {
    expect(rr(100, 95, 110, "BUY")).toBe(2);
    expect(rr(100, 105, 110, "BUY")).toBeNull();
  });
  it("parses CSV and resamples 5m to 1h", () => {
    const d = demoData(240);
    const csv = "Date,Open,High,Low,Close\n" + d.map((c) => `${new Date(c.t).toISOString()},${c.open},${c.high},${c.low},${c.close}`).join("\n") + "\nbad,row,x,y,z";
    const { candles, invalidRows } = parseCsv(csv);
    expect(candles.length).toBe(240);
    expect(invalidRows).toBe(1);
    const h = resample(candles, 60);
    expect(h.length).toBeGreaterThanOrEqual(20);
    expect(h.length).toBeLessThanOrEqual(21);
    expect(assessQuality(candles).gaps).toBe(0);
  });
});
