import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { assessQuality, demoData, detectTimeframeMinutes, parseCsv, resample, TIMEFRAMES, type Timeframe } from "./engine/data";
import { classifyNews } from "./engine/news";
import type { Candle, DataQuality, NewsRisk } from "./engine/types";

interface NewsInput { minutes: string; highImpact: boolean; event: string }

interface MarketCtx {
  source: { kind: "demo" | "csv"; name: string; baseMinutes: number };
  timeframe: Timeframe;
  setTimeframe: (t: Timeframe) => void;
  candles: Candle[];
  quality: DataQuality;
  loadCsv: (file: File) => Promise<void>;
  useDemo: () => void;
  error: string | null;
  newsInput: NewsInput;
  setNewsInput: (n: NewsInput) => void;
  news: NewsRisk;
}

const Ctx = createContext<MarketCtx | null>(null);

export function MarketDataProvider({ children }: { children: ReactNode }) {
  const [raw, setRaw] = useState(() => ({ candles: demoData(), invalid: 0, dup: 0 }));
  const [source, setSource] = useState<MarketCtx["source"]>({ kind: "demo", name: "Demo data (synthetic)", baseMinutes: 5 });
  const [timeframe, setTimeframe] = useState<Timeframe>("5m");
  const [error, setError] = useState<string | null>(null);
  const [newsInput, setNewsInput] = useState<NewsInput>({ minutes: "", highImpact: true, event: "" });

  const candles = useMemo(() => {
    const target = TIMEFRAMES[timeframe];
    return target > source.baseMinutes ? resample(raw.candles, target) : raw.candles;
  }, [raw, timeframe, source.baseMinutes]);
  const quality = useMemo(() => assessQuality(candles, raw.invalid, raw.dup), [candles, raw]);
  const news = useMemo(
    () => classifyNews(newsInput.minutes.trim() === "" ? null : Number(newsInput.minutes), newsInput.highImpact, newsInput.event),
    [newsInput],
  );

  const pickTf = (base: number): Timeframe =>
    (Object.entries(TIMEFRAMES).find(([, m]) => m >= base)?.[0] as Timeframe) ?? "1D";

  const value: MarketCtx = {
    source, timeframe, candles, quality, error, newsInput, setNewsInput, news,
    setTimeframe: (t) => { if (TIMEFRAMES[t] >= source.baseMinutes) setTimeframe(t); },
    loadCsv: async (file) => {
      try {
        const r = parseCsv(await file.text());
        const base = Math.max(1, detectTimeframeMinutes(r.candles));
        setRaw({ candles: r.candles, invalid: r.invalidRows, dup: r.duplicates });
        setSource({ kind: "csv", name: file.name, baseMinutes: base });
        setTimeframe(pickTf(base));
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not read the file.");
      }
    },
    useDemo: () => {
      setRaw({ candles: demoData(), invalid: 0, dup: 0 });
      setSource({ kind: "demo", name: "Demo data (synthetic)", baseMinutes: 5 });
      setTimeframe("5m");
      setError(null);
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMarketData() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useMarketData must be used inside MarketDataProvider");
  return c;
}
