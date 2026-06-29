# solana-staking-yield-skill

A Solana staking & LST yield comparison skill for autonomous AI agents.

Solves three problems any Solana agent hits when deciding what to do with idle SOL:

1. **Validator selection** — don't just pick the top-3 by stake (centralization + governance risk). Score by commission + concentration + uptime + delinquency.
2. **Native vs LST** — jitoSOL/mSOL/bSOL add liquidity at a small yield cost; sometimes that trade-off is worth it.
3. **Yield estimation** — exact APR projection for any principal/commission/horizon combination.

## Quick start

```bash
npm install
node scripts/fetch_validators.mjs --limit 20 > validators.json
node scripts/score_validator.mjs --input validators.json --limit 10
node scripts/simulate_stake.mjs --principal 1000 --commission 5 --epochs 30
node scripts/lst_yield_comparison.mjs --principal 1000 --days 365
```

## Test

```bash
npm test
```

All scripts accept `--help` for full usage.

## Scripts

| Script | Purpose |
|---|---|
| `scripts/fetch_validators.mjs` | Pull current validator set + epoch info from mainnet/testnet RPC |
| `scripts/score_validator.mjs` | Rank validators by quality (commission + concentration + uptime + delinquency) |
| `scripts/simulate_stake.mjs` | Project SOL yield for any principal/commission/horizon |
| `scripts/lst_yield_comparison.mjs` | Rank native SOL vs jitoSOL/mSOL/bSOL/INF by net APR |

## Why it exists

Most existing Solana skills in this bounty repo focus on transactions and risk. None of them covered:

- **Validator selection beyond "pick the top"** — a real gap because the top validators control >30% of stake
- **LST yield comparison** — agents holding idle SOL need a clear picture of native vs liquid
- **Yield simulation** — so an agent can decide whether X SOL held for Y days is worth delegating

## License

MIT.