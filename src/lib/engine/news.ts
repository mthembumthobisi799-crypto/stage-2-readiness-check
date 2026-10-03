import type { NewsRisk } from "./types";

export const NO_NEWS: NewsRisk = {
  level: "UNKNOWN",
  event: "No news calendar connected",
  note: "Enter upcoming events manually until a verified calendar feed is connected.",
};

export function classifyNews(minutesToEvent: number | null, highImpact: boolean, eventName = ""): NewsRisk {
  if (minutesToEvent === null || !Number.isFinite(minutesToEvent)) return NO_NEWS;
  const name = eventName || (highImpact ? "High-impact event" : "No high-impact event");
  if (highImpact && minutesToEvent >= -15 && minutesToEvent <= 30)
    return { level: "VERY HIGH", event: name, note: "Technical levels are unreliable around a high-impact release." };
  if (highImpact && minutesToEvent > 30 && minutesToEvent <= 120)
    return { level: "HIGH", event: name, note: "Confidence reduced — volatility and slippage can increase." };
  if (highImpact) return { level: "ELEVATED", event: name, note: "Monitor event risk." };
  return { level: "LOW", event: name, note: "No high-impact event is imminent (manually supplied)." };
}
