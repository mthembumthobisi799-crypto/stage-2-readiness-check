import { detectTimeframeMinutes, parseCsv } from "../engine/data";
import { buildFromBase } from "./aggregate";
import type { MarketDataProvider } from "./types";

export function csvProvider(file: File): MarketDataProvider {
  return {
    id: "csv",
    label: file.name,
    async load() {
      const { candles, invalidRows, duplicates } = parseCsv(await file.text());
      const base = Math.max(1, detectTimeframeMinutes(candles));
      if (base > 15) throw new Error(`This file is ${base}-minute data. The strategy needs 15-minute or finer data.`);
      const ds = buildFromBase(candles, base, file.name);
      if (invalidRows) ds.notes.push(`${invalidRows} invalid rows skipped.`);
      if (duplicates) ds.notes.push(`${duplicates} duplicate timestamps merged.`);
      return ds;
    },
  };
}
