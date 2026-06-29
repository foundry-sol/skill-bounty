---
name: prediction-market
description: Prediction market data + trading for Solana agents. Supports Polymarket (EVM), Drift Protocol (Solana), and Kalshi (US). Includes market discovery, edge calculation, position tracking, and Kelly-criterion position sizing.
when_to_use: |
  When an autonomous agent needs to:
  - Find active prediction markets across multiple platforms
  - Calculate edge between a belief and the market price
  - Size a position using Kelly criterion
  - Track open positions and P&L across platforms
  - Decide whether a trade is worth taking
keywords:
  - solana
  - prediction-markets
  - polymarket
  - drift
  - kalshi
  - kelly-criterion
  - edge
  - betting
  - ai-agents
---

# Prediction Market Skill

Prediction markets let agents speculate on real-world events. This skill gives Solana agents the tools to discover markets, calculate edge, size positions, and track P&L across multiple platforms.

## What it covers

| Question | Script |
|---|---|
| What markets are active on Polymarket/Drift/Kalshi? | `scripts/prediction_data.mjs` |
| Is this trade worth taking? How much should I bet? | `scripts/edge_calculator.mjs` |
| What are my open positions and P&L? | `scripts/position_tracker.mjs` |
| How do I use it from the CLI? | `scripts/index.mjs` |

## When to use

**Before any prediction market trade:**
1. Fetch markets from relevant sources (`markets --source all`)
2. Find one where you have an edge (your belief > market price)
3. Use `analyze` to calculate optimal position size
4. Open position with `positions open`
5. Track with `positions show` and `positions close` when done

**For ongoing monitoring:**
- Fetch markets periodically to find new opportunities
- Use portfolio() to compute total P&L
- Auto-exit positions when edge reverses

## Decision flow

```
Want to trade a prediction market?
│
├─ Fetch markets from all sources
│  │
│  └─ Find one with: high volume, clear question, near resolution
│
├─ Do you have a belief about the outcome?
│  │
│  ├─ NO → Don't trade
│  │
│  └─ YES → Calculate edge
│
├─ Run analyze
│  │
│  ├─ Recommendation: SKIP
│  │  └─ Edge too small (<2%) → Not worth fees
│  │
│  ├─ Recommendation: BUY YES/NO
│  │  │
│  │  └─ Position size > 0
│  │     └─ Check bankroll remaining
│  │        └─ Place trade via exchange API
│  │
│  └─ Position size = 0 (low confidence)
│     └─ Wait for stronger signal
│
└─ Track position
   └─ Close when edge reverses or market resolves
```

## Anti-patterns this skill guards against

1. **Trading without edge** — randomly entering markets because they look interesting
2. **Over-sizing** — risking too much on a single market (capped at 25% of bankroll via Kelly)
3. **Ignoring fees** — small edges get eaten by trading fees
4. **No tracking** — losing track of positions and P&L
5. **Reactive trading** — entering markets based on news without checking your actual belief
6. **Overconfidence** — using confidence=1.0 on every trade (clamped via Kelly)

## What this skill does NOT do

- Does NOT execute trades (you submit your own orders)
- Does NOT handle private APIs (Polymarket requires auth for placing orders)
- Does NOT handle market resolution automatically (you close positions manually)
- Does NOT handle taxes or accounting

## Examples

See `examples/` for:
- Common market configurations
- Integration patterns
- Strategy examples

## Related skills (in this repo)

- `multi-agent-orchestration-skill` — coordinate multiple agents on research
- `mev-sentry-skill` — protect against MEV
- `solana-tx-simulation-skill` — pre-flight tx validation

## License

MIT.