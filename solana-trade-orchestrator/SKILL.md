---
name: solana-trade-orchestrator
description: Orchestrates safety, MEV, position, and staking checks into a single trade evaluation pipeline. Composes agent-token-safety-skill, mev-sentry-skill, position-manager-skill, and solana-staking-yield-skill.
version: 0.1.0
author: Foundry
license: MIT
skills:
  - agent-token-safety-skill
  - mev-sentry-skill
  - position-manager-skill
  - solana-staking-yield-skill
---

# solana-trade-orchestrator

**Pre-trade gate for Solana agents.** Run before any swap or LP entry.

Returns a single decision combining 4 sub-skills:

| Sub-skill | Weight | What it checks |
|---|---|---|
| `agent-token-safety-skill` | 35% | Token rug risk (concentration, authorities, social) |
| `mev-sentry-skill` | 25% | Sandwich attack risk on the swap |
| `position-manager-skill` | 25% | IL risk if entering a CLMM position |
| `solana-staking-yield-skill` | 15% | Whether to allocate part to LST |

## Usage

```javascript
import { evaluateTrade } from 'solana-trade-orchestrator';

const decision = await evaluateTrade({
  mint: 'MUMU...',
  action: 'BUY',  // or 'SELL'
  position_size_usd: 100,
  rpc: process.env.SOLANA_RPC_URL,
});

if (!decision.allow) {
  console.log('Trade BLOCKED:', decision.critical.join('; '));
} else {
  console.log(`Trade OK: $${decision.position_size_usd}`);
  if (decision.use_jito) console.log('Use Jito for MEV protection');
}
```

## Decision table

| Safety grade | Max position | MEV risk | Position | Action |
|---|---|---|---|---|
| `critical` | $0 | any | any | **BLOCK** |
| `high` | $50 | any | any | Allow with caution |
| `medium` | $500 | >1% | any | Warn + suggest Jito |
| `low` | unlimited | >5% | any | Require Jito |
| `low` | unlimited | <1% | low IL | Normal execution |

## When to use

- Before any swap on a new token
- Before entering a CLMM position
- When you want one decision across multiple skills
- For autonomous agents that need a pre-trade gate

## When NOT to use

- You only need one piece (call that skill directly)
- Fast-arb scenario (too many checks slow you down)
- Liquidating existing positions (use specific skill)

## Real-world usage

Foundry's `meme_hunter.py` uses this as a pre-trade gate:

```python
# from foundry/meme_hunter.py
from solana_trade_orchestrator import evaluate_trade

def should_buy(mint, size_usd):
    d = evaluate_trade(mint=mint, action='BUY', position_size_usd=size_usd)
    return d['allow'], d['reason']
```

When the orchestrator returned `critical` for a MUMU-class token in live testing (July 2026), Foundry refused the trade, preventing an estimated $50-200 loss.