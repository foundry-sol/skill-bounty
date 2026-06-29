# mev-sentry-skill

MEV protection for Solana agents. Detects sandwich attack risk, estimates Jito tips, simulates sandwich outcomes.

Solves three real problems for any Solana trader:

1. **Sandwich detection** — `sandwich_detector.mjs` — estimate if your swap is a sandwich target
2. **Jito tip estimation** — `jito_tip_estimator.mjs` — figure out how much to tip to outbid sandwich bots
3. **Sandwich simulation** — `sandwich_simulator.mjs` — model what an attacker would do (defensive research)

## Quick start

```bash
npm install
node scripts/index.mjs demo       # see all features
node --test tests/*.test.mjs     # 16 tests
```

## CLI

```bash
# Estimate sandwich risk for a swap
node scripts/index.mjs sandwich \
  --amount 50000 --reserve-in 100000 --reserve-out 5000000 --slippage 100

# Get Jito tip recommendation
node scripts/index.mjs tip \
  --value 50000 --congestion high --mev-protected --urgent

# Simulate sandwich outcomes
node scripts/index.mjs simulate \
  --amount 50000 --reserve-in 100000 --reserve-out 5000000
```

## Test

```bash
npm test
```

16 tests cover:
- Price impact calculation (basic, large trades, invalid input)
- Sandwich loss estimation (depth sensitivity, risk levels)
- Jito tip estimation (congestion, value caps, MEV flags)
- Sandwich simulation (multi-attacker comparison)

## Real-world usage

Foundry uses this for:
- Every trade before submission: check sandwich risk
- Thin pool detection: skip trades >5% of pool
- Jito tip calculation for MEV-protected bundles
- Avoiding losses on large swaps

## Defense in depth

For maximum protection, combine with:
1. **Jito bundles** (this skill) — front-run protection
2. **Tight slippage** (this skill recommends) — limits attack profit
3. **Split trades** — break large trades into smaller ones
4. **Off-peak timing** — trade when mempool is empty
5. **Limit orders** — avoid market orders on thin pools

## License

MIT.