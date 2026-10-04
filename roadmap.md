# XAUUSD Analyst roadmap

- [x] Stage 1: inspect V2, run tests (6/6 passed)
- [x] Stage 2: rebuild as web app — engine port, analysis page, walk-forward backtest, CSV + timeframes, tests
- [ ] Multi-timeframe strategy engine: 4H trend, 15m market structure shift, liquidity sweep, FVG, supply/demand, candle patterns (low weight)
- [ ] Timeframes 1m to 4H, building higher timeframes from lower ones where needed
- [ ] Probabilities taken from historical backtest outcomes, not fixed percentages
- [ ] Market data provider layer kept separate from the strategy (demo, CSV, Twelve Data)
- [ ] Live XAUUSD prices (Twelve Data) — waiting on the user's API key
- [ ] Monthly economic calendar (Financial Modeling Prep) feeding news risk — waiting on the user's API key
- [ ] News-impact estimate from past events of each type — needs calendar + history
- [ ] Remaining brief sections (multi-timeframe confluence UI polish, paper-trade journal)
- No automatic trade execution, ever.
