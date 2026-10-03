import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useMemo } from "react";
import { CandleChart } from "@/components/CandleChart";
import { DataControls } from "@/components/DataControls";
import { analyze } from "@/lib/engine/analysis";
import { useMarketData } from "@/lib/market-data";
import type { Decision } from "@/lib/engine/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "XAUUSD Analyst — Market Assessment" },
      { name: "description", content: "Evidence-based XAUUSD research: decision, probability estimates, trade plan and conflicting evidence." },
      { property: "og:title", content: "XAUUSD Analyst — Market Assessment" },
      { property: "og:description", content: "Evidence-based gold market research and paper-trading analysis." },
    ],
  }),
  component: AnalysisPage,
});

const DECISION_CLS: Record<Decision, string> = {
  BUY: "text-bull border-bull", SELL: "text-bear border-bear",
  WAIT: "text-warn border-warn", "NO TRADE": "text-muted-foreground border-border", UNCERTAIN: "text-neutral border-neutral",
};
const f2 = (n: number) => n.toFixed(2);

function Stat({ label, value, cls = "" }: { label: string; value: string; cls?: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 font-medium ${cls}`}>{value}</div>
    </div>
  );
}

function Bar({ label, v, cls }: { label: string; v: number; cls: string }) {
  return (
    <div>
      <div className="flex justify-between text-sm"><span>{label}</span><span className="num">{(v * 100).toFixed(1)}%</span></div>
      <div className="mt-1 h-2 rounded bg-muted"><div className={`h-2 rounded ${cls}`} style={{ width: `${v * 100}%` }} /></div>
    </div>
  );
}

function AnalysisPage() {
  const { candles, quality, news, newsInput, setNewsInput } = useMarketData();
  const r = useMemo(() => analyze(candles, { news, quality }), [candles, news, quality]);
  const p = r.plan;

  return (
    <div className="space-y-5">
      <DataControls />
      <section className="grid gap-4 md:grid-cols-[280px_1fr]">
        <div className={`flex flex-col justify-center rounded-md border-2 bg-card p-5 ${DECISION_CLS[r.decision]}`}>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Decision</div>
          <div className="mt-1 text-5xl font-bold tracking-tight">{r.decision}</div>
          <div className="mt-2 text-sm text-foreground">Confidence: <b>{r.confidence}</b></div>
          <div className="num mt-1 text-sm text-muted-foreground">Price {f2(r.currentPrice)}</div>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Regime" value={r.regime} />
          <Stat label="Session" value={r.session} />
          <Stat label="News risk" value={r.news.level} cls={r.news.level.includes("HIGH") ? "text-bear" : ""} />
          <Stat label="Data quality" value={`${r.dataQuality.status} · ${r.dataQuality.candles}`} cls={r.dataQuality.status === "GOOD" ? "text-bull" : "text-warn"} />
          <Stat label="Bias" value={r.bias} />
          <Stat label="Structure" value={`${r.structure.state}${r.structure.bos ? ` · BOS ${r.structure.bos}` : ""}`} />
          <Stat label="AMD" value={r.amd.phase} />
          <Stat label="Zones / FVGs" value={`${r.zones.demand.length}D ${r.zones.supply.length}S / ${r.fvgs.length}`} />
        </div>
      </section>

      <p className="rounded-md border border-border bg-card/60 p-4 text-sm leading-relaxed">{r.reasoning}</p>

      <div className="rounded-md border border-border bg-card p-3"><CandleChart candles={candles} plan={p} /></div>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="space-y-3 rounded-md border border-border bg-card p-4">
          <h2 className="font-semibold">Probability estimates</h2>
          <Bar label="Bullish" v={r.probabilities.bullish} cls="bg-bull" />
          <Bar label="Bearish" v={r.probabilities.bearish} cls="bg-bear" />
          <Bar label="Ranging" v={r.probabilities.range} cls="bg-neutral" />
          <p className="text-xs text-warn">{r.warning}</p>
        </div>

        <div className="rounded-md border border-border bg-card p-4">
          <h2 className="font-semibold">Trade plan</h2>
          {p ? (
            <dl className="num mt-3 grid grid-cols-2 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Entry zone</dt><dd>{f2(p.entryLow)} – {f2(p.entryHigh)}</dd>
              <dt className="text-muted-foreground">Stop-loss zone</dt><dd className="text-bear">{f2(p.stopZoneLow)} – {f2(p.stopZoneHigh)}</dd>
              {(["tp1", "tp2", "tp3"] as const).map((k, i) => (
                <Fragment key={k}><dt className="text-muted-foreground">{k.toUpperCase()}</dt><dd className="text-bull">{f2(p[k])} <span className="text-muted-foreground">({p.rr[i].toFixed(2)}R)</span></dd></Fragment>
              ))}
              <dt className="text-muted-foreground">Invalidation</dt><dd>{f2(p.invalidation)}</dd>
            </dl>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">No valid setup. Entry, stop and targets are only shown for BUY or SELL decisions.</p>
          )}
        </div>

        <div className="space-y-2 rounded-md border border-border bg-card p-4 text-sm">
          <h2 className="font-semibold">News risk (manual)</h2>
          <input className="w-full rounded border border-input bg-background px-2 py-1" placeholder="Event, e.g. US CPI" value={newsInput.event} onChange={(e) => setNewsInput({ ...newsInput, event: e.target.value })} />
          <input className="num w-full rounded border border-input bg-background px-2 py-1" type="number" placeholder="Minutes until event" value={newsInput.minutes} onChange={(e) => setNewsInput({ ...newsInput, minutes: e.target.value })} />
          <label className="flex items-center gap-2"><input type="checkbox" checked={newsInput.highImpact} onChange={(e) => setNewsInput({ ...newsInput, highImpact: e.target.checked })} /> High impact</label>
          <p className="text-xs text-muted-foreground">{r.news.note}</p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-md border border-border bg-card p-4">
          <h2 className="font-semibold text-bull">Supporting evidence</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{r.evidenceFor.length ? r.evidenceFor.map((e) => <li key={e}>{e}</li>) : <li className="text-muted-foreground">None</li>}</ul>
        </div>
        <div className="rounded-md border border-border bg-card p-4">
          <h2 className="font-semibold text-bear">Conflicting evidence</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{r.evidenceAgainst.length ? r.evidenceAgainst.map((e) => <li key={e}>{e}</li>) : <li className="text-muted-foreground">None</li>}</ul>
        </div>
      </section>
      {r.dataQuality.notes.length > 0 && <p className="text-xs text-muted-foreground">Data notes: {r.dataQuality.notes.join(" ")}</p>}
    </div>
  );
}
