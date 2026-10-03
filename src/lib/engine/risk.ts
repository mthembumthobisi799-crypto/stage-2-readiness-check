export function rr(entry: number, stop: number, target: number, side: "BUY" | "SELL"): number | null {
  const risk = side === "BUY" ? entry - stop : stop - entry;
  const reward = side === "BUY" ? target - entry : entry - target;
  if (risk <= 0 || reward <= 0) return null;
  return reward / risk;
}

/** Paper-trading position size in units for a given account risk. */
export function positionSize(equity: number, riskPct: number, entry: number, stop: number, pointValue = 1): number | null {
  const dist = Math.abs(entry - stop);
  if (dist <= 0 || pointValue <= 0) return null;
  return (equity * riskPct) / 100 / (dist * pointValue);
}
