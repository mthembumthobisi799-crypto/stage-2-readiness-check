import { fetchTwelveDataFrames } from "./twelvedata.functions";
import { MTF_TIMEFRAMES, type MarketDataProvider, type MtfDataset, type MtfTf } from "./types";

export const twelveDataProvider: MarketDataProvider = {
  id: "twelvedata",
  label: "Twelve Data — live XAU/USD",
  async load() {
    const r = await fetchTwelveDataFrames({ data: { outputsize: 5000 } });
    if (!r.ok) throw new Error(r.error);
    const frames: MtfDataset["frames"] = {};
    const now = r.fetchedAt;
    for (const tf of Object.keys(MTF_TIMEFRAMES) as MtfTf[]) {
      const c = r.frames[tf] ?? [];
      // Drop the still-forming candle so decisions only use closed candles.
      frames[tf] = c.filter((x) => x.t + MTF_TIMEFRAMES[tf] * 60_000 <= now);
    }
    return { source: this.label, live: true, frames, notes: [`Fetched ${new Date(now).toISOString().slice(0, 16).replace("T", " ")} UTC.`] };
  },
};
