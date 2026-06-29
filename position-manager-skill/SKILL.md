---
name: position-manager
description: Track CLMM LP positions across Orca Whirlpools, Raydium CLMM, and Meteora DLMM. Detects out-of-range positions, calculates impermanent loss, and proposes rebalance ranges. Built for the Solana AI Kit.
version: 1.0.0
license: MIT
author: Foundry
---

# Position Manager

Manage concentrated-liquidity positions across Solana's three main CLMM protocols.

## When to use this skill

Load this skill when the user asks any of:

- "What are my CLMM positions and which are out of range?"
- "Check my LP positions for impermanent loss."
- "Should I rebalance my [Orca/Raydium/Meteora] position?"
- "Find positions that need attention."
- "Compute current value vs. initial deposit for my liquidity positions."

Don't load this skill for:

- Spot token balances (use a wallet skill).
- Swap routing (use Jupiter).
- Token price prediction (use market data skill).

## Routing

Read the most relevant focused file based on the user's question:

| User wants... | Read |
|---|---|
| Fetch all positions | `skill/fetch-positions.md` |
| Impermanent loss calculation | `skill/impermanent-loss.md` |
| Out-of-range detection | `skill/alerts.md` |
| Rebalance proposals | `skill/rebalance-suggestions.md` |
| Protocol-specific behavior | `skill/orca-positions.md`, `skill/raydium-positions.md`, or `skill/meteora-positions.md` |

If unclear, start with `skill/fetch-positions.md` and follow the routing inside.

## Scripts (callable)

All scripts are in `scripts/` and use Node.js ≥18 with `@solana/web3.js`.

```bash
# List all CLMM positions for a wallet
node scripts/fetch_positions.mjs --wallet <PUBKEY> [--rpc <URL>] [--protocol orca|raydium|meteora|all]

# Compute IL for a given position
node scripts/calculate_il.mjs --position <PATH_OR_JSON>

# Check out-of-range status
node scripts/check_outofrange.mjs --position <PATH_OR_JSON>

# Propose rebalance
node scripts/suggest_rebalance.mjs --position <PATH_OR_JSON> [--current-price <PRICE>]
```

All scripts emit JSON to stdout suitable for agent reasoning.

## Inputs

| Input | Required | Description |
|---|---|---|
| `wallet` | yes | Solana wallet public key (base58) |
| `rpc` | no | Solana RPC URL (defaults to mainnet-beta public) |
| `protocol` | no | One of `orca`, `raydium`, `meteora`, `all` (default `all`) |
| `position` | for IL/range/rebalance | Position JSON or path to a JSON file |

## Outputs

All scripts emit a structured JSON envelope:

```json
{
  "ok": true,
  "data": { ... },
  "warnings": [],
  "errors": []
}
```

Errors are non-zero exit codes with `{ "ok": false, "error": "..." }`.

## Risk rails (Foundry integration)

If the Foundry risk manager is detected (env var `FOUNDRY_STATE_FILE`), scripts will pipe any proposed rebalance through it before returning. This enforces:

- Per-trade max USD
- Daily loss cap
- Cumulative kill switch

See `skill/risk-integration.md` (TBD) for details.

## Quick example

```bash
# Get all positions for wallet 7xKXt... in dev mode
node scripts/fetch_positions.mjs --wallet 7xKXt... --rpc https://api.devnet.solana.com

# Pick the first out-of-range position and propose a rebalance
node scripts/suggest_rebalance.mjs --position ./examples/orca_position.json
```

## Testing

```bash
npm test
```

Runs Node's built-in test runner against `tests/`.

## Limits

- Public RPC has rate limits. For production monitoring, use a private RPC (Helius, QuickNode, Triton).
- IL formula assumes the position is two-sided and within the original range. Out-of-range positions compute IL based on the closer bound.
- Rebalance suggestions are heuristic. Always verify against your own risk tolerance before executing.

## License

MIT.