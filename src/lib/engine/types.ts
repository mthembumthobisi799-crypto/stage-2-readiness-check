export interface Candle {
  t: number; // epoch ms, UTC
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface FeatureRow extends Candle {
  atr14: number; // NaN until enough candles
  ema20: number;
  ema50: number;
  ema200: number;
  range: number;
  body: number;
  upperWick: number;
  lowerWick: number;
  bullEngulf: boolean;
  bearEngulf: boolean;
  bullPin: boolean;
  bearPin: boolean;
}

export type Decision = "BUY" | "SELL" | "WAIT" | "NO TRADE" | "UNCERTAIN";
export type Confidence = "Very Strong" | "Strong" | "Moderate" | "Weak" | "No Trade";
export type Regime = "TRENDING" | "RANGING" | "HIGH-VOLATILITY" | "UNKNOWN";
export type NewsLevel = "UNKNOWN" | "LOW" | "ELEVATED" | "HIGH" | "VERY HIGH";

export interface NewsRisk {
  level: NewsLevel;
  event: string;
  note: string;
}

export interface Swing {
  i: number;
  price: number;
  t: number;
}

export interface Zone {
  low: number;
  high: number;
  score: number;
  kind: "DEMAND" | "SUPPLY";
}

export interface Fvg {
  type: "BULLISH" | "BEARISH";
  low: number;
  high: number;
}

export interface LiquidityPool {
  type: "BUY_SIDE" | "SELL_SIDE";
  price: number;
}

export interface AmdState {
  phase: "ACCUMULATION" | "MANIPULATION" | "INCOMPLETE" | "NOT CONFIRMED";
  direction?: "BULLISH" | "BEARISH";
  reason: string;
}

export interface DataQuality {
  status: "GOOD" | "FAIR" | "POOR";
  candles: number;
  gaps: number;
  invalidRows: number;
  duplicates: number;
  notes: string[];
}

export interface TradePlan {
  direction: "BUY" | "SELL";
  entryLow: number;
  entryHigh: number;
  entry: number;
  stop: number;
  stopZoneLow: number;
  stopZoneHigh: number;
  tp1: number;
  tp2: number;
  tp3: number;
  rr: [number, number, number];
  invalidation: number;
}

export interface AnalysisResult {
  decision: Decision;
  confidence: Confidence;
  bias: "Bullish" | "Bearish" | "Neutral";
  probabilities: { bullish: number; bearish: number; range: number };
  plan: TradePlan | null;
  reasoning: string;
  evidenceFor: string[];
  evidenceAgainst: string[];
  regime: Regime;
  session: string;
  news: NewsRisk;
  dataQuality: DataQuality;
  amd: AmdState;
  structure: { state: string; bos: string | null };
  currentPrice: number;
  zones: { demand: Zone[]; supply: Zone[] };
  fvgs: Fvg[];
  liquidity: LiquidityPool[];
  warning: string;
}
