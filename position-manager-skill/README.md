# Position Manager Skill

> **Solana AI Kit skill by Foundry.** CLMM position manager for Orca Whirlpools, Raydium CLMM, and Meteora DLMM — tracks impermanent loss, alerts on out-of-range positions, and suggests rebalances.

This skill is built for the [Solana AI Kit](https://github.com/solanabr/solana-ai-kit) and ships as a progressive, token-efficient loadable module for coding agents (Claude Code / Codex / Cursor / etc.).

---

## The problem

Concentrated Liquidity Market Makers (CLMMs) on Solana — Orca Whirlpools, Raydium CLMM, Meteora DLMM — let LPs choose a price range for their liquidity. Get the range right and you earn more fees. Get it wrong and:

- **Out-of-range positions** earn zero fees until price returns to range.
- **Impermanent loss (IL)** silently eats your principal vs. just holding.
- **No consolidated view** — positions live across 3 different protocols with 3 different UIs.

Most LPs check manually, reactively, sometimes daily. Agents should be doing this every block.

## What this skill does

| Capability | Description |
|---|---|
| **Fetch positions** | List all CLMM positions for a given wallet across Orca / Raydium / Meteora in one call. |
| **Calculate IL** | Compute current impermanent loss vs. initial deposit, per position, with current value estimate. |
| **Out-of-range alert** | Detect positions whose current tick is outside the chosen range. Flag urgency (in-range vs. near-boundary vs. out-of-range). |
| **Suggest rebalance** | When a position is out-of-range or has high IL, propose a rebalance — new range, expected IL recovery, gas estimate. |
| **Risk-rail aware** | Optional: pipe results through the Foundry risk manager for kill-switch checks before suggesting action. |

## Install

```bash
# Install dependencies
npm install

# Verify
node scripts/fetch_positions.mjs --wallet <SOLANA_ADDRESS> --rpc <RPC_URL>
```

## Quick start (as an agent skill)

The skill loads via the Solana AI Kit's progressive skill hub. Once installed, an agent invoked via Claude Code / Codex can:

1. Ask "what are my CLMM positions and which are out of range?"
2. The skill loads `SKILL.md` → routes to focused files (`orca-positions.md`, etc.)
3. Scripts run via `node scripts/...` 
4. Output is structured JSON for the agent to reason about.

Example agent prompt:
> "Check my wallet `7xKXtg...` for out-of-range CLMM positions and propose rebalances."

## Architecture

```
position-manager-skill/
├── SKILL.md                     # Entry point — agent reads this first
├── skill/                       # Progressive, focused knowledge files
│   ├── orca-positions.md
│   ├── raydium-positions.md
│   ├── meteora-positions.md
│   ├── impermanent-loss.md
│   ├── rebalance-suggestions.md
│   └── alerts.md
├── scripts/                     # Working Node.js executables
│   ├── fetch_positions.mjs
│   ├── calculate_il.mjs
│   ├── check_outofrange.mjs
│   └── suggest_rebalance.mjs
├── examples/                    # Sample position data
│   ├── orca_position.json
│   └── raydium_position.json
├── tests/                       # Node test runner
│   ├── calculate_il.test.mjs
│   ├── check_outofrange.test.mjs
│   └── suggest_rebalance.test.mjs
├── install.sh                   # Installer (drop into ~/solana-ai-kit/skills/)
├── package.json
├── LICENSE                      # MIT
└── README.md                    # This file
```

## Why this skill exists

Foundry is an autonomous Solana trading agent. CLMM positions are a natural fit because:
- They generate yield (fees) when in range
- They have a clear, measurable risk state (in/out of range, IL)
- They benefit from constant monitoring (humans don't do it; agents should)

This skill is built from Foundry's own internal tooling and exposed for other agents.

## License

MIT — see LICENSE.

---

Built by [Foundry](https://github.com/foundry-sol) for the [Solana AI Kit](https://github.com/solanabr/solana-ai-kit) by Superteam Brazil.