---
name: mev-sentry
description: MEV protection for Solana agents. Detects sandwich attack risk, estimates Jito tips, simulates sandwich outcomes, and recommends protection strategies (private mempool, Jito bundles, slippage tuning).
when_to_use: |
  When an agent is about to submit a swap on Solana:
  - Check sandwich risk before submitting
  - Decide on Jito tip amount for MEV protection
  - Simulate what an attacker could extract
  - Tighten slippage based on pool depth and trade size
keywords:
  - solana
  - mev
  - jito
  - sandwich-attack
  - front-running
  - mempool
  - private-mempool
  - slippage
---

# MEV Sentry Skill

MEV (Maximal Extractable Value) is a real risk for Solana traders. Sandwich attacks alone extract millions from retail users every month. This skill gives autonomous agents the tools to detect, simulate, and protect against MEV before submitting transactions.

## What it covers

| Question | Script |
|---|---|
| How vulnerable is my swap to a sandwich attack? | `scripts/sandwich_detector.mjs` |
| What Jito tip should I pay to outbid sandwich bots? | `scripts/jito_tip_estimator.mjs` |
| What would an attacker actually do? (research only) | `scripts/sandwich_simulator.mjs` |
| How do I use it from the command line? | `scripts/index.mjs` |

## When to use

**Before every swap:**
1. Run `sandwich_detector` to estimate risk
2. If risk is high, either:
   - Reduce your slippage (cheaper option)
   - Use a Jito bundle with `jito_tip_estimator` (more reliable)
3. If risk is low, proceed normally

**For research:**
- Use `sandwich_simulator` to model what attackers do
- Helps you understand when to be defensive

**For ongoing monitoring:**
- Watch pool depth over time
- Set alerts for thin pools (low reserve / high volume ratio)

## Decision flow

```
About to submit a swap
│
├─ What's the trade size vs pool reserves?
│  │
│  ├─ Trade < 1% of pool → Low risk
│  │
│  └─ Trade > 5% of pool → High risk
│
├─ Run sandwich_detector
│  │
│  ├─ Risk: low → Proceed
│  │
│  ├─ Risk: medium → Tighten slippage to 30-50 bps
│  │
│  └─ Risk: high → Use Jito bundle (or split into smaller trades)
│
└─ If using Jito:
   └─ Run tip_estimator with --mev-protected flag
```

## Anti-patterns this skill guards against

1. **Ignoring pool depth** — Thin pools = sandwich magnets regardless of slippage
2. **Over-tight slippage** — Setting 0-10 bps on volatile pairs = stuck tx / failed tx
3. **Over-loose slippage** — Setting 500+ bps = sandwich bot's dream
4. **No Jito tip** — On busy chains, your tx can be stuck or sandwiched
5. **Fixed slippage across pools** — Same slippage on USDC/SOL vs a thin altcoin pool = different risk
6. **Trusting wallet defaults** — Most wallets set 100-300 bps default; that's not always right

## What this skill does NOT do

- Does NOT execute transactions (you submit your own tx)
- Does NOT monitor mempool in real time (it's a pre-tx analyzer)
- Does NOT detect JIT liquidations (Solana-specific pattern, separate skill)
- Does NOT perform sandwich attacks itself (defensive only)

## Examples

See `examples/` for:
- Common pool configurations
- Risk assessment examples
- Integration patterns

## Related skills (in this repo)

- `solana-tx-simulation-skill` — pre-flight tx simulation
- `position-manager-skill` — for autonomous trading agents
- `multi-agent-orchestration-skill` — for multi-agent consensus on risk

## License

MIT.