# nft-portfolio-skill

NFT portfolio tracking for Solana agents. Wallet holdings, Magic Eden + Tensor floor prices, P&L across multiple wallets, rarity ranking.

Solves three real problems:
1. **Portfolio tracking** — `portfolio_tracker.mjs` — multi-wallet value + P&L
2. **Holdings discovery** — `nft_fetcher.mjs` — Solana RPC + marketplace APIs
3. **Rarity analysis** — `rarity_scorer.mjs` — trait-based ranking + outlier detection

## Quick start

```bash
npm install
node scripts/index.mjs demo
node --test tests/*.test.mjs
```

## CLI

```bash
# Fetch NFTs for a wallet
node scripts/index.mjs fetch <wallet-address>

# Calculate portfolio value
node scripts/index.mjs value <wallet-address>

# Rank rarity from a JSON file
node scripts/index.mjs rarity nfts.json
```

## Test

```bash
npm test
```

16 tests cover:
- Rarity scoring (standard + statistical methods)
- Trait index building
- Outlier detection
- Portfolio valuation (multi-wallet, P&L, cost basis)
- Persistence across instances

## Real-world usage

Foundry uses this for:
- Tracking its own NFT positions (when relevant)
- Identifying undervalued high-rarity NFTs
- Portfolio overview across multiple test wallets
- Rarity ranking before manual buy decisions

## Defense in depth

For NFT trading:
1. **Always check floor price before buying** — listed ≠ floor
2. **Track rarity** — rare + low floor = opportunity
3. **Set cost basis immediately** — forget and you can't compute P&L
4. **Diversify across collections** — don't go all-in on one
5. **Watch for wash trades** — low volume = easy to manipulate floor

## License

MIT.