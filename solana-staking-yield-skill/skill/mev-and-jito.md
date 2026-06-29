# MEV & Jito Tip Capture — What's Actually Happening

For agents deciding whether to use jitoSOL, this explains the MEV economics.

## What is MEV on Solana?

MEV = Maximal Extractable Value. It's the value a validator (or block builder) can capture by reordering, inserting, or censoring transactions within a block.

On Solana specifically, MEV mostly comes from:

1. **Arbitrage** — between DEX prices that drift briefly
2. **Liquidations** — capturing bonus rewards when leveraged positions get liquidated
3. **Sandwich attacks** — front-running large swaps

## Jito's role

Jito runs a modified Solana client (Jito-Solana) that:

1. Operates a **tip router** — users can attach a tip to transactions, validators collect it
2. Operates **block engine** — bundles transactions optimally for MEV capture
3. Distributes MEV tips to **jitoSOL stakers** proportional to their stake

So when you hold jitoSOL, you're entitled to a share of the MEV tips earned by the Jito stake pool's validators.

## How much extra yield does this add?

Recent data (last 6 months of 2024/early 2025): jitoSOL earned ~0.7-1.2% APR *above* the base inflation rate.

This means:
- Base inflation: ~7% APR
- jitoSOL extra: ~1% APR from MEV
- jitoSOL total: ~8% APR

Volatile. During high-activity periods (NFT mints, memecoin launches) MEV spikes. During quiet periods, MEV is small.

## Risks specific to jitoSOL

1. **Regulatory** — MEV has regulatory uncertainty. If classified as "trading activity," could face different tax treatment.
2. **Jito stake pool concentration** — jitoSOL is one stake pool. If it gets hacked or exploited, you lose.
3. **MEV competition** — as more agents extract MEV, the easy profit disappears. Future yield drag possible.

## When MEV tip flow breaks down

If Solana governance decides to:
- Block MEV extraction at the protocol level (unlikely)
- Mandate MEV redistribution to all stakers (possible, would erase jitoSOL's edge)
- Regulate Jito as a financial intermediary (uncertain)

In any of these scenarios, jitoSOL becomes equivalent to a regular LST and the APR premium disappears.

## Practical advice for agents

- **Diversify across LSTs** — don't put everything in jitoSOL. A split of jitoSOL + mSOL is more robust.
- **Monitor MEV yield** — `lst_yield_comparison.mjs` lets you track relative performance.
- **Don't bet your treasury on MEV alone** — MEV is bonus yield, not the base case.

## What this skill does not do

This skill tracks and compares LST yields. It does NOT:

- Predict MEV flows
- Optimize MEV extraction strategies
- Run a Jito-Solana client
- Provide tax or regulatory advice

For those, you'd need additional infrastructure.

## See also

- `lst-vs-native.md` — overall native vs LST decision
- `scoring.md` — for picking the right validator for native stake