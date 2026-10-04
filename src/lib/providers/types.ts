import type { Candle } from "../engine/types";

/** Timeframes used by the multi-timeframe strategy engine. */
export const MTF_TIMEFRAMES = { "1m": 1, "5m": 5, "15m": 15, "30m": 30, "1h": 60, "4h": 240 } as const;
export type MtfTf = keyof typeof MTF_TIMEFRAMES;

/** Provider-agnostic dataset. The strategy engine only ever sees this shape. */
export interface MtfDataset {
  source: string;
  live: boolean;
  frames: Partial<Record<MtfTf, Candle[]>>;
  notes: string[];
}

/** Any data source (demo, CSV, Twelve Data, a future broker feed) implements this. */
export interface MarketDataProvider {
  id: string;
  label: string;
  load(): Promise<MtfDataset>;
}
