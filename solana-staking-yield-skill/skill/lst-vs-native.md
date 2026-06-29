# Native SOL Staking vs LSTs — Decision Guide

This is a detailed walk-through for agents deciding between native SOL delegation and a Liquid Staking Token.

## The fundamental trade-off

Native SOL staking gives you the **highest yield** (typically 7-7.5% APR net after validator commission). LSTs trade a small yield drag (0.5-1%) for **liquidity** — your position becomes a token you can use in DeFi immediately.

For an agent that wants to:
- Hold SOL long-term and earn yield → native SOL stake
- Use SOL as DeFi collateral or move between protocols → LST

## The math

Starting with 1,000 SOL over 1 year:

| Option | APR | Yield (SOL) | Liquid? | DeFi-usable? |
|---|---|---|---|---|
| Native SOL (5% validator) | 7.0% | ~70 | No | No |
| jitoSOL | 8.2% | ~82 | Yes | Yes |
| mSOL | 7.1% | ~71 | Yes | Yes |
| bSOL | 7.05% | ~70.5 | Yes | Yes |
| INF | 7.3% | ~73 | Yes | Yes |

jitoSOL *outperforms* native SOL net because it captures MEV tips on top of base inflation. The validator commission already deducted; jitoSOL adds MEV on top.

Wait — that means jitoSOL is strictly better than native SOL? Almost:

- jitoSOL has a small depeg risk vs SOL (typically 0.01-0.05%)
- jitoSOL has a small spread cost (~0.05%)
- jitoSOL requires trusting the Jito stake pool program

For an agent OK with that risk profile, jitoSOL wins. For maximum safety, native SOL.

## When to prefer native SOL

- **Staking is your endgame** — you don't need to use the SOL elsewhere
- **Validator commission matters** — picking a 0% validator gives you the full 4.5% inflation
- **Avoiding protocol risk** — you don't want exposure to a stake pool program

## When to prefer jitoSOL

- **You might want to exit fast** — jitoSOL can be swapped to SOL instantly on Jupiter
- **DeFi composability** — supply jitoSOL on Kamino, MarginFi, Drift, etc. for extra yield
- **MEV exposure** — you want to capture MEV without running your own Jito-Solana client

## When to prefer mSOL

- **Decentralization matters more than MEV** — Marinade spreads stake across many validators
- **You want Marinade's governance** — mSOL holders vote in Marin DAO

## The hidden cost: stake warmup/cooldown

Native SOL takes:
- ~2-3 days to **activate** after first delegation (warmup)
- ~2-3 days to **deactivate** after undelegating (cooldown)

During these periods, your SOL earns no rewards AND is illiquid. For an agent that might need to rebalance or exit, that's a real cost.

LSTs avoid this entirely — instant liquidity.

## Combining: a "laddered" approach

Some agents split: 70% in jitoSOL (liquidity + MEV), 30% in native SOL (max yield, illiquid reserve).

This way you have:
- A liquid base that earns decent yield
- An illiquid "bonus" that earns max yield
- Diversification across two mechanisms

## Recommendation for Foundry

For a small-cap autonomous agent that may need to exit fast to fund other strategies:

- **80% jitoSOL** — liquid, MEV-augmented, DeFi-usable
- **20% native SOL** — on a top-scoring validator from `score_validator.mjs` for max APR

This balances yield (jitoSOL > native for our purposes) with optionality.

## See also

- `../simulate_stake.mjs` — for projecting actual returns
- `../score_validator.mjs` — for picking the right validator for native stake
- `mev-and-jito.md` — for understanding the MEV tip capture flow