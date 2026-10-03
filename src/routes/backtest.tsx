import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { DataControls } from "@/components/DataControls";
import { performanceReport, runBacktest, splitWalkForward, type TargetChoice, type Trade } from "@/lib/engine/backtest";
import { useMarketData } from "@/lib/market-data";
import type { Confidence } from "@/lib/engine/types";

export const Route = createFileRoute("/backtest")({
  head: () => ({
    meta: [
      { title: "XAUUSD Analyst — Walk-Forward Backtest" },
      { name: "description", content: "Walk-forward historical backtest of the XAUUSD analysis engine with no look-ahead." },
      { property: "og:title", content: "XAUUSD Analyst — Walk-Forward Backtest" },
      { property: "og:description", content: "Test the gold analysis engine on history without hindsight." },
    ],
  }),
  component: BacktestPage,
});

type Segment = "all" | "train" | "validation" | "test";

function BacktestPage() {
  const { candles } = useMarketData();
  const [segment, setSegment] = useState<Segment>("all");
  const [target, setTarget] = useState<TargetChoice>("TP2");
  const [minConf, setMinConf] = useState<Confidence>("Moderate");
  const [step, setStep] = useState(5);
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [running, setRunning] = useState(false);

  const run = () => {
    setRunning(true);
    setTimeout(() => {
      const data = segment === "all" ? candles : splitWalkForward(candles)[segment];
      setTrades(runBacktest(data, { warmup: Math.min(250, Math.floor(data.length / 3)), step, target, minConfidence: minConf }));
      setRunning(false);
    }, 20);
  };
  const rep = trades ? performanceReport(trades) : null;
  const sel = "rounded border border-input bg-background px-2 py-1";
  const fmt = (t: number) => new Date(t).toISOString().slice(0, 16).replace("T", " ");

  return (
    <div className="space-y-5">
      <DataControls />
      <div className="flex flex-wrap items-end gap-4 rounded-md border border-border bg-card p-4 text-sm">
        <label className="space-y-1"><div className="text-muted-foreground">Segment</div>
          <select className={sel} value={segment} onChange={(e) => setSegment(e.target.value as Segment)}>
            <option value="all">All data</option><option value="train">Train (first 60%)</option>
            <option value="validation">Validation (next 20%)</option><option value="test">Test (last 20%)</option>
          </select></label>
        <label className="space-y-1"><div className="text-muted-foreground">Target</div>
          <select className={sel} value={target} onChange={(e) => setTarget(e.target.value as TargetChoice)}>
            {["TP1", "TP2", "TP3", "2R"].map((t) => <option key={t}>{t}</option>)}
          </select></label>
        <label className="space-y-1"><div className="text-muted-foreground">Min confidence</div>
          <select className={sel} value={minConf} onChange={(e) => setMinConf(e.target.value as Confidence)}>
            {["Weak", "Moderate", "Strong", "Very Strong"].map((t) => <option key={t}>{t}</option>)}
          </select></label>
        <label className="space-y-1"><div className="text-muted-foreground">Step (candles)</div>
          <input type="number" min={1} max={50} className={`${sel} num w-20`} value={step} onChange={(e) => setStep(Math.max(1, +e.target.value || 1))} /></label>
        <button onClick={run} disabled={running} className="rounded bg-primary px-5 py-2 font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
          {running ? "Running…" : "Run backtest"}
        </button>
        <p className="w-full text-xs text-muted-foreground">
          At each step the engine only sees past candles. Entry is the next candle's open. If one candle hits both stop and target, it counts as a loss. Pick settings on Train/Validation, then judge on Test once.
        </p>
      </div>

      {trades && !rep && <p className="text-muted-foreground">No trades met the criteria.</p>}
      {rep && (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              ["Trades", rep.trades], ["Win rate", `${(rep.winRate * 100).toFixed(1)}%`],
              ["Expectancy", `${rep.expectancyR.toFixed(2)}R`], ["Total", `${rep.totalR.toFixed(2)}R`],
              ["Profit factor", Number.isFinite(rep.profitFactor) ? rep.profitFactor.toFixed(2) : "∞"],
              ["Max drawdown", `${rep.maxDrawdownR.toFixed(2)}R`], ["Max loss streak", rep.maxConsecutiveLosses],
              ["Wins / Losses", `${rep.wins} / ${rep.losses}`], ["Timeouts", rep.timeouts], ["Ambiguous", rep.ambiguous],
            ].map(([k, v]) => (
              <div key={k} className="rounded-md border border-border bg-card p-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">{k}</div>
                <div className="num mt-1 text-lg">{v}</div>
              </div>
            ))}
          </section>
          <EquityCurve equity={rep.equity} />
          <section className="grid gap-4 md:grid-cols-2">
            {([["By regime", rep.byRegime], ["By AMD hypothesis", rep.byAmd]] as const).map(([title, g]) => (
              <div key={title} className="rounded-md border border-border bg-card p-4 text-sm">
                <h2 className="mb-2 font-semibold">{title}</h2>
                <table className="num w-full"><tbody>
                  {Object.entries(g).map(([k, v]) => (
                    <tr key={k} className="border-t border-border"><td className="py-1">{k}</td><td>{v.trades} trades</td><td>{((v.wins / v.trades) * 100).toFixed(0)}% win</td><td className={v.totalR >= 0 ? "text-bull" : "text-bear"}>{v.totalR.toFixed(2)}R</td></tr>
                  ))}
                </tbody></table>
              </div>
            ))}
          </section>
          <div className="overflow-x-auto rounded-md border border-border bg-card">
            <table className="num w-full text-xs">
              <thead className="text-muted-foreground"><tr>{["Decision", "Entry time", "Exit time", "Side", "Entry", "Stop", "Target", "Outcome", "R", "Confidence", "Regime"].map((h) => <th key={h} className="p-2 text-left font-normal">{h}</th>)}</tr></thead>
              <tbody>{trades!.map((t) => (
                <tr key={t.decisionTime} className="border-t border-border">
                  <td className="p-2">{fmt(t.decisionTime)}</td><td className="p-2">{fmt(t.entryTime)}</td><td className="p-2">{fmt(t.exitTime)}</td>
                  <td className={`p-2 ${t.side === "BUY" ? "text-bull" : "text-bear"}`}>{t.side}</td>
                  <td className="p-2">{t.entry.toFixed(2)}</td><td className="p-2">{t.stop.toFixed(2)}</td><td className="p-2">{t.target.toFixed(2)}</td>
                  <td className="p-2">{t.outcome}</td><td className={`p-2 ${t.R >= 0 ? "text-bull" : "text-bear"}`}>{t.R.toFixed(2)}</td>
                  <td className="p-2">{t.confidence}</td><td className="p-2">{t.regime}</td>
                </tr>))}</tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function EquityCurve({ equity }: { equity: number[] }) {
  const pts = [0, ...equity];
  const W = 1000, H = 180;
  const hi = Math.max(...pts), lo = Math.min(...pts);
  const y = (v: number) => 10 + ((hi - v) / (hi - lo || 1)) * (H - 20);
  const d = pts.map((v, i) => `${i ? "L" : "M"}${(i / (pts.length - 1)) * W},${y(v)}`).join(" ");
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">Equity curve (R)</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Equity curve">
        <line x1={0} x2={W} y1={y(0)} y2={y(0)} className="stroke-border" />
        <path d={d} fill="none" className="stroke-primary" strokeWidth={2} />
      </svg>
    </div>
  );
}
