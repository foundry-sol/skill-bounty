---
name: agent-token-safety
description: Score a Solana token's rug-pull risk from a JSON report — holder concentration, mint/freeze authority, liquidity depth, social presence, and trading patterns. Returns a risk grade (low/medium/high/critical) with specific flags. Built for the Solana AI Kit.
version: 1.0.0
license: MIT
author: Foundry
---

# Agent Token Safety

Given a `TokenSafetyReport` describing a Solana token, return a single risk grade with specific flags and recommendations. Solves the recurring problem of "is this new agent token safe to trade?" — especially relevant for AI agents scanning the agent-token meta on Solana.

## When to use this skill

Load this skill when the user asks any of:

- "Is this token safe to buy?"
- "What's the rug risk on this mint?"
- "Check this token before I trade it."
- "Score the risk of [mint address]."

Don't load for:

- Price prediction (use a market data skill).
- Portfolio rebalancing (use position-manager-skill).
- Direct trade execution (use Jupiter + risk-rail skill).

## Routing

| User wants... | Read |
|---|---|
| Score a token from raw data | `skill/scoring.md` |
| Build the input report | `skill/building-reports.md` |
| Understand the scoring weights | `skill/scoring.md#weights` |
| See red flag examples | `skill/flags.md` |

## Scripts (callable)

All scripts are in `scripts/` and use Node.js ≥18 with `@solana/web3.js`.

```bash
# Pull holder data from Solana RPC
node scripts/fetch_holders.mjs --mint <MINT> [--rpc <URL>]

# Pull mint + freeze authority + supply
node scripts/fetch_authorities.mjs --mint <MINT> [--rpc <URL>]

# Pull Twitter / website / Telegram from DexScreener
node scripts/fetch_social.mjs --mint <MINT>

# Composite risk score from a report
node scripts/assess_safety.mjs --json '<REPORT_JSON>'
# or: --report path/to/report.json
# or: pipe via stdin
```

All scripts emit structured JSON suitable for agent reasoning.

## Inputs

The composite scorer takes a `TokenSafetyReport`:

```json
{
  "mint": "...",
  "holders": { "total_holders": 5000, "top_10_pct": 15, "top_1_pct": 3 },
  "authorities": { "mint_authority": null, "freeze_authority": null, "supply": 1e9, "decimals": 9 },
  "liquidity": { "liquidity_usd": 500000, "volume_24h_usd": 100000, "pool_age_days": 90 },
  "social": { "has_twitter": true, "has_website": true, "twitter_followers": 10000 },
  "trading": { "volume_24h": 100000, "buy_sell_ratio": 1.1, "price_change_24h_pct": 2 }
}
```

Any field can be omitted — missing data is treated as "no signal" and doesn't trigger warnings.

## Outputs

```json
{
  "ok": true,
  "data": {
    "mint": "...",
    "risk_grade": "low|medium|high|critical",
    "risk_score": 0-100,
    "component_scores": {
      "holder_concentration": 0-100,
      "authorities": 0-100,
      "liquidity": 0-100,
      "social_presence": 0-100,
      "trading_patterns": 0-100
    },
    "flags": ["specific warning", "..."],
    "recommendation": "human-readable next step"
  }
}
```

## Risk grade thresholds

| Score | Grade | Recommendation |
|---|---|---|
| 0–24 | low | Looks reasonable. Standard risk management. |
| 25–49 | medium | Caution. Small positions, tight stops. |
| 50–74 | high | Avoid. Trade only with size you can lose entirely. |
| 75+ | critical | DO NOT TRADE. |

**Veto overrides:** Active `mint_authority` or `freeze_authority` escalates the grade to at least `high`, regardless of composite score. These are deal-breakers.

## Quick example (programmatic)

```js
import { scoreSafety } from './scripts/assess_safety.mjs';

const report = {
  mint: 'TokenAddr...',
  holders: { total_holders: 50, top_10_pct: 95, top_1_pct: 60 },
  authorities: { mint_authority: 'ActiveAuth...', freeze_authority: null },
  liquidity: { liquidity_usd: 500, pool_age_days: 1 },
  social: { has_twitter: false, has_website: false },
};

const result = scoreSafety(report);
console.log(result.risk_grade); // "critical"
console.log(result.flags);       // ["CRITICAL: Top 10 wallets own > 80% of supply...", ...]
```

## Limits

- Holder data is top-20 only from `getTokenLargestAccounts` — for full distribution, use a third-party API (Helius, Birdeye).
- Twitter follower counts require a separate Twitter/X API call.
- The script is heuristic — it identifies red flags, not guarantees. Always DYOR.
- This skill scores risk, it does not score expected return. Combine with your own thesis.

## License

MIT.