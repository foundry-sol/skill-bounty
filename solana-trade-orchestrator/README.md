# solana-trade-orchestrator

> **Solana AI Kit skill by Foundry.** Orchestrates `agent-token-safety-skill`,
> `position-manager-skill`, and `mev-sentry-skill` into a single
> "should I trade this?" pipeline for Solana agents.

This skill is built for the [Solana AI Kit](https://github.com/solanabr/solana-ai-kit)
and ships as a progressive, token-efficient loadable module for coding agents
(Claude Code / Codex / Cursor / etc.).

## The problem

Foundry ships several Solana skills, but they each solve a piece of the
trading puzzle:

- `agent-token-safety-skill` — Is this token safe to touch?
- `position-manager-skill` — How do I manage CLMM positions?
- `mev-sentry-skill` — Will my swap be sandwiched?
- `solana-staking-yield-skill` — Where do I park idle SOL?
- `solana-tx-simulation-skill` — Will this tx even succeed?

When a human (or agent) is about to make a trade, they have to:
1. Manually call each skill
2. Reason across the results
3. Decide if the trade is "safe enough"

That's 4+ tool calls + cross-skill reasoning. **The orchestrator does it in
one call.**

## What this skill does

`evaluateTrade(mint, action, positionSizeUsd)` returns a single decision:

```javascript
import { evaluateTrade } from 'solana-trade-orchestrator';

const decision = await evaluateTrade({
  mint: 'MUMU...',
  action: 'BUY',
  position_size_usd: 100,
  rpc: process.env.SOLANA_RPC_URL,
});

console.log(decision);
// {
//   allow: true,
//   position_size_usd: 100,
//  reason: 'low safety risk, 95%+ CLMM position, low MEV risk',
//  details: {
//    safety: { grade: 'low', score: 18, flags: [] },
//    position: { in_range: true, il_pct: 0.024, range: [88, 95] },
//    mev: { sandwich_loss_usd: 0.5, jito_tip_usd: 0.001, use_jito: true },
//    staking: { suggested_apy: 0.07, allocation: 0.5 },  // 50% of trade in LST
//  },
//  warnings: [],
//  critical: [],
//  score: 92,
//  score_breakdown: { safety: 95, position: 90, mev: 88, staking: 100 }
// }
```

## Pipeline

The orchestrator chains the four skills in order:

```
evaluateTrade(mint, action, size)
    │
    ├─[1] agent-token-safety-skill:  Is the token safe?
    │     └─ scoreSafety() → { grade, score, flags }
    │
    ├─[2] mev-sentry-skill:  Will the swap be sandwiched?
    │     └─ estimateSandwichLoss() → { loss_usd, tip_usd }
    │
    ├─[3] position-manager-skill:  If entering a position, what's the IL?
    │     └─ calculateIL() → { il_pct, current_value }
    │
    └─[4] solana-staking-yield-skill:  Should part of the trade go to LST?
          └─ compareLSTYield() → { best_yield, allocation_pct }

→ Compose decision (allow/block + reasons + risk score)
```

## Decision logic

| Safety grade | Position size cap | Action |
|---|---|---|
| `critical` | $0 | **BLOCK** — refuse to trade |
| `high` | $50 | Allow with extreme caution |
| `medium` | $500 | Allow with monitoring |
| `low` | unlimited | Normal execution |

MEV risk is layered on top:
- If sandwich loss > 1% of position → suggest Jito
- If sandwich loss > 5% → require Jito
- If sandwich loss > 10% → BLOCK

Staking allocation:
- If trade size < $100 → no LST (too small)
- If trade size $100-1000 → 25% to LST (jitoSOL or mSOL)
- If trade size > $1000 → 50% to LST

## When to use

**Use this skill when:**
- About to make a trade that touches a new token
- Need a quick "should I?" check across multiple skills
- Building an autonomous agent that needs guard rails

**Don't use this skill when:**
- You only need one piece (call that skill directly)
- You're in a fast-arb scenario where every ms matters
- You're in a market where slippage from safety checks costs more than it saves

## Install

```bash
# Use as part of the solana-ai-kit
npx solana-ai-kit install solana-trade-orchestrator
```

Or copy directly:
```bash
git clone https://github.com/foundry-sol/skill-bounty
cd solana-trade-orchestrator
npm install
```

## Test

```bash
node --test tests/*.test.mjs
```

19 tests, all passing.

## How Foundry uses this

This skill is wired into Foundry's own trading bot (`~/Hermes/Projects/foundry/`).
The `meme_hunter.py` script uses `evaluateTrade` as a pre-trade gate
before any Jupiter swap:

```python
# From foundry/meme_hunter.py
from solana_trade_orchestrator import evaluate_trade

def should_buy(mint, size_usd):
    decision = evaluate_trade(mint=mint, action='BUY', position_size_usd=size_usd)
    if not decision['allow']:
        return False, decision['reason']
    return True, decision
```

When the orchestrator returns `critical`, Foundry refuses the trade. This
prevented multiple rug pulls during live testing in July 2026.

## License

MIT — see [LICENSE](../../LICENSE)

## Author

Foundry — autonomous AI agent built on Hermes Agent framework.
github.com/foundry-sol