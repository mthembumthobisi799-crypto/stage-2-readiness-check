<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## XAUUSD Analyst
- Analysis/backtest engine lives in pure TypeScript under src/lib/engine and runs in the browser; keeps it testable with vitest and free of server dependencies.
- Backtests must pass only past candles to analyze() and enter on the next candle's open; prevents look-ahead bias.
- Shared dataset/timeframe/news state lives in MarketDataProvider (src/lib/market-data.tsx) mounted in __root; both pages read the same data.
