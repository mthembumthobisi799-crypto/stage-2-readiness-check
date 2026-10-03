import { useMarketData } from "@/lib/market-data";
import { TIMEFRAMES, type Timeframe } from "@/lib/engine/data";

export function DataControls() {
  const m = useMarketData();
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-card/60 p-3 text-sm">
      <span className="text-muted-foreground">Data:</span>
      <span className="font-medium">{m.source.name}</span>
      <label className="cursor-pointer rounded border border-border px-3 py-1 hover:border-primary hover:text-primary">
        Upload CSV
        <input type="file" accept=".csv,.txt" className="hidden" onChange={(e) => e.target.files?.[0] && m.loadCsv(e.target.files[0])} />
      </label>
      {m.source.kind === "csv" && (
        <button onClick={m.useDemo} className="rounded border border-border px-3 py-1 hover:border-primary hover:text-primary">Use demo</button>
      )}
      <div className="ml-auto flex gap-1" role="group" aria-label="Timeframe">
        {(Object.keys(TIMEFRAMES) as Timeframe[]).map((tf) => {
          const disabled = TIMEFRAMES[tf] < m.source.baseMinutes;
          return (
            <button key={tf} disabled={disabled} onClick={() => m.setTimeframe(tf)}
              className={`num rounded px-2 py-1 text-xs ${m.timeframe === tf ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"} disabled:opacity-30`}>
              {tf}
            </button>
          );
        })}
      </div>
      {m.error && <p className="w-full text-bear">{m.error}</p>}
      {m.source.kind === "demo" && (
        <p className="w-full text-xs text-warn">Demo data is synthetic — upload real XAUUSD history (timestamp, open, high, low, close) for genuine research.</p>
      )}
    </div>
  );
}
