# prediction-market-skill

Prediction market toolkit for Solana agents. Discover markets, calculate edge, size positions, track P&L across **Polymarket**, **Drift Protocol** (Solana), and **Kalshi**.

Solves three real problems for any prediction market trader:

1. **Market discovery** — `prediction_data.mjs` — fetch active markets from all sources
2. **Edge calculation** — `edge_calculator.mjs` — Kelly-criterion position sizing
3. **Position tracking** — `position_tracker.mjs` — open/close/P&L across platforms

## Quick start

```bash
npm install
node scripts/index.mjs demo
node --test tests/*.test.mjs
```

## CLI

```bash
# Fetch markets
node scripts/index.mjs markets --source all
node scripts/index.mjs markets --source polymarket --limit 100

# Calculate edge
node scripts/index.mjs analyze --belief 0.65 --market 0.50 --confidence 0.7 --bankroll 1000

# Position management
node scripts/index.mjs positions open --id p1 --platform polymarket --side YES --size 100 --entry 0.45
node scripts/index.mjs positions show
node scripts/index.mjs positions close --id p1 --exit 0.55
```

## Test

```bash
npm test
```

16 tests cover:
- Edge calculation (positive/negative, edge thresholds, Kelly clamping)
- Position tracker (open/close, YES/NO P&L, validation, portfolio aggregation)
- Market normalization (Polymarket/Drift/Kalshi formats)

## Real-world usage

Foundry uses this for:
- Discovering high-edge prediction markets across platforms
- Sizing positions to never risk more than 25% of bankroll
- Tracking P&L across multiple prediction market accounts
- Comparing edges across Polymarket, Drift, and Kalshi

## Defense in depth

For maximum safety:
1. **Always calculate edge first** — don't trade on gut feeling
2. **Use Kelly with confidence scaling** — even huge edge should only get 25% of bankroll
3. **Track positions** — never forget what you have open
4. **Set stop losses** — close positions when edge reverses
5. **Diversify** — don't put all bankroll in one market

## License

MIT.