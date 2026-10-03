import type { Candle, TradePlan } from "@/lib/engine/types";

interface Props { candles: Candle[]; plan?: TradePlan | null; count?: number }

export function CandleChart({ candles, plan, count = 140 }: Props) {
  const data = candles.slice(-count);
  const W = 1000, H = 420, padR = 70;
  const levels = plan ? [plan.stop, plan.tp1, plan.tp2, plan.tp3, plan.entry] : [];
  const hi = Math.max(...data.map((c) => c.high), ...levels);
  const lo = Math.min(...data.map((c) => c.low), ...levels);
  const y = (p: number) => 12 + ((hi - p) / (hi - lo || 1)) * (H - 24);
  const cw = (W - padR) / data.length;
  const line = (p: number, label: string, cls: string) => (
    <g key={label}>
      <line x1={0} x2={W - padR} y1={y(p)} y2={y(p)} className={cls} strokeDasharray="4 4" strokeWidth={1} />
      <text x={W - padR + 4} y={y(p) + 4} className={`num ${cls.replace("stroke", "fill")}`} fontSize={11}>{label} {p.toFixed(2)}</text>
    </g>
  );
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="XAUUSD candlestick chart">
      {data.map((c, i) => {
        const up = c.close >= c.open;
        const x = i * cw + cw / 2;
        return (
          <g key={c.t} className={up ? "fill-bull stroke-bull" : "fill-bear stroke-bear"}>
            <line x1={x} x2={x} y1={y(c.high)} y2={y(c.low)} strokeWidth={1} />
            <rect x={x - cw * 0.35} width={cw * 0.7} y={y(Math.max(c.open, c.close))} height={Math.max(1, Math.abs(y(c.open) - y(c.close)))} />
          </g>
        );
      })}
      {plan && (
        <>
          <rect x={0} width={W - padR} y={y(plan.entryHigh)} height={Math.abs(y(plan.entryLow) - y(plan.entryHigh))} className="fill-primary/15" />
          {line(plan.entry, "Entry", "stroke-primary")}
          {line(plan.stop, "SL", "stroke-bear")}
          {line(plan.tp1, "TP1", "stroke-bull")}
          {line(plan.tp2, "TP2", "stroke-bull")}
          {line(plan.tp3, "TP3", "stroke-bull")}
        </>
      )}
    </svg>
  );
}
