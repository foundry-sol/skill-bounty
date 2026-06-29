---
name: nft-portfolio
description: NFT portfolio tracking for Solana agents. Fetches wallet holdings, queries Magic Eden + Tensor floor prices, calculates portfolio value and P&L across multiple wallets, ranks rarity within collections.
when_to_use: |
  When an agent needs to:
  - Track NFT holdings across multiple Solana wallets
  - Get current floor prices for collections
  - Calculate total portfolio value + P&L
  - Rank NFTs by rarity within a collection
  - Identify statistically rare NFTs
keywords:
  - solana
  - nft
  - portfolio
  - magic-eden
  - tensor
  - valuation
  - rarity
  - ai-agents
---

# NFT Portfolio Skill

NFT portfolio tracking for Solana wallets. Pulls holdings from Solana RPC, queries Magic Eden and Tensor for floor prices, calculates P&L, ranks rarity. Built for autonomous agents managing NFT positions.

## What it covers

| Question | Script |
|---|---|
| What NFTs does this wallet own? | `scripts/nft_fetcher.mjs` |
| How much is my portfolio worth? | `scripts/portfolio_tracker.mjs` |
| Which NFTs are rare? | `scripts/rarity_scorer.mjs` |
| How do I use it from the CLI? | `scripts/index.mjs` |

## When to use

**For portfolio management:**
1. Fetch holdings for each wallet you care about
2. Set cost basis when you buy (optional, for P&L)
3. Run periodic valuation to track total worth
4. Re-rank rarity to find hidden gems

**For opportunity hunting:**
1. Scan collections for high-rarity + low-floor-price opportunities
2. Track floor prices for "buy the dip" entries
3. Identify outliers — NFTs statistically rarer than peers

## Decision flow

```
Tracking NFT portfolio?
│
├─ Add wallets → setHoldings(wallet, nfts)
│  │
│  └─ Optionally: setCostBasis(mint, price) for each NFT you bought
│
├─ Run periodic valuation
│  │
│  └─ Uses Magic Eden / Tensor floor prices
│     │
│     └─ Computes total value, P&L, per-wallet breakdown
│
├─ Want to find rare NFTs?
│  │
│  └─ rankRarities(nfts, method='statistical')
│     │
│     └─ Or findOutliers(nfts) → statistically rare (>2 std dev)
│
└─ Decision points:
   │
   ├─ Floor < cost basis → "down" position
   │
   ├─ Floor > cost basis → "up" position
   │
   └─ High rarity + low floor → potential opportunity
```

## Anti-patterns this skill guards against

1. **Ignoring floor prices** — last-sale price is not current value
2. **Ignoring unvalued NFTs** — explicit tracking of unvalued vs valued
3. **No cost basis** — P&L requires knowing what you paid
4. **Treating all NFTs as equal** — rarity scores differentiate
5. **One-wallet bias** — multi-wallet aggregation built-in

## What this skill does NOT do

- Does NOT execute trades (no buy/sell automation)
- Does NOT track floor price history (snapshots only)
- Does NOT handle marketplace authentication
- Does NOT detect wash trades or fake volume

## Examples

See `examples/` for common NFT collections and rarity calculations.

## Related skills (in this repo)

- `prediction-market-skill` — for prediction market analysis
- `mev-sentry-skill` — for MEV protection on swaps
- `multi-agent-orchestration-skill` — multi-agent consensus

## License

MIT.