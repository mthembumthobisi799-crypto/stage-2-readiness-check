import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const INTERVALS = { "1m": "1min", "5m": "5min", "15m": "15min", "30m": "30min", "1h": "1h", "4h": "4h" } as const;

export const fetchTwelveDataFrames = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ outputsize: z.number().int().min(100).max(5000) }).parse(d))
  .handler(async ({ data }) => {
    const key = process.env["TWELVE_DATA_API_KEY"];
    if (!key) return { ok: false as const, error: "Live prices aren't set up yet — the Twelve Data key is missing." };
    const frames: Record<string, { t: number; open: number; high: number; low: number; close: number }[]> = {};
    for (const [tf, interval] of Object.entries(INTERVALS)) {
      const url = new URL("https://api.twelvedata.com/time_series");
      url.search = new URLSearchParams({ symbol: "XAU/USD", interval, outputsize: String(data.outputsize), timezone: "UTC", format: "JSON", apikey: key }).toString();
      const res = await fetch(url);
      const json = (await res.json()) as { status?: string; message?: string; values?: Record<string, string>[] };
      if (!res.ok || json.status === "error" || !json.values) {
        return { ok: false as const, error: `Twelve Data (${tf}): ${json.message ?? res.statusText}` };
      }
      frames[tf] = json.values
        .map((v) => ({ t: Date.parse(v.datetime.replace(" ", "T") + "Z"), open: +v.open, high: +v.high, low: +v.low, close: +v.close }))
        .filter((c) => Number.isFinite(c.t) && Number.isFinite(c.close))
        .sort((a, b) => a.t - b.t);
    }
    return { ok: true as const, frames, fetchedAt: Date.now() };
  });
