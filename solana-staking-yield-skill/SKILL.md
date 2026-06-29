---
name: solana-staking-yield
description: Validator selection, native staking simulation, and LST yield comparison for Solana AI agents. Use when the agent needs to choose a validator, decide between native stake and a liquid staking token (LST) like jitoSOL / mSOL / bSOL, or estimate staking returns for a principal.
when_to_use: When the agent is about to stake SOL, evaluate an LST, compare yield across staking options, or score validator quality before delegation.
keywords:
  - solana
  - staking
  - validator
  - lst
  - jitoSOL
  - mSOL
  - bSOL
  - yield
  - mev
---

# Solana Staking & Yield Skill

This skill gives an autonomous Solana agent the data and reasoning needed to make staking decisions without leaking alpha to a third-party service.

## What it covers

| Question | Script |
|---|---|
| Who are the top validators right now? | `scripts/fetch_validators.mjs` |
| Which validator should I delegate to? | `scripts/score_validator.mjs` |
| What will I earn staking X SOL for N epochs? | `scripts/simulate_stake.mjs` |
| Native SOL vs jitoSOL vs mSOL — which wins? | `scripts/lst_yield_comparison.mjs` |

## When to use

- **Before delegating stake**: Run `fetch_validators.mjs` then `score_validator.mjs --input validators.json`. Pick top 3 with low commission, active status, and no centralization flags.
- **Before deciding native vs LST**: Run `lst_yield_comparison.mjs --principal X`. Default is 1000 SOL; pass your actual size.
- **For portfolio planning**: Run `simulate_stake.mjs --principal X --commission 5 --epochs 30` to project 30-epoch yield (~75 days).

## Decision flow for an autonomous agent

```
Need to stake SOL?
│
├─ Liquid required for DeFi?  → YES → Use jitoSOL (highest yield + liquid + low depeg risk)
│                               NO  → Native SOL (highest APR, illiquid during warmup/cooldown)
│
├─ Validator has > 5% network stake? → AVOID (centralization risk)
├─ Validator commission > 10%?       → AVOID (uncompetitive yield)
├─ Validator delinquent?              → AVOID
└─ Default: top-scoring active validator with 5-10% commission, <3% stake share
```

## Anti-patterns this skill guards against

1. **Centralization whalevoting** — picking the top-3 by stake just because they're "reliable" actually hurts the network and creates governance capture risk. The scoring explicitly penalizes >5% stake share.
2. **Zero-commission surprise** — a 0% commission validator can raise it to 100% after you delegate. The scoring flags `zero_commission_can_increase` and gives such validators lower headroom.
3. **Forgetting MEV** — jitoSOL captures MEV tips on top of base inflation, ~0.7-1.2% APR extra. The LST comparison makes this explicit.
4. **Ignoring warmup/cooldown** — native stake takes ~2.5 days to activate and ~2.5 days to deactivate. During that time your SOL is illiquid. The skill documents this; LSTs avoid it.

## Inputs and outputs

All scripts accept CLI flags (see each script's `--help`). Outputs are designed to be both human-readable (default) and JSON (`--json`) for piping into other agents.

The skill is **read-only** by default — none of the scripts sign or send transactions. To actually delegate stake, an agent needs to combine this with `@solana/web3.js` StakeProgram instructions and its own keypair handling. The skill can *recommend* validators but does not perform the delegation.

## Related skills (in this repo)

- `position-manager-skill` — for active LP positions (composable with LSTs)
- `agent-token-safety-skill` — for screening tokens before wrapping into LSTs
- `solana-tx-simulation-skill` — for pre-flight simulation of the actual stake tx

## License

MIT.