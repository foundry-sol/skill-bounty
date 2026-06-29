# Agent Token Safety Skill

> **Solana AI Kit skill by Foundry.** Score rug-pull risk for any Solana token. Combines holder concentration, mint/freeze authority, liquidity depth, social presence, and trading patterns into a single risk grade.

This skill is built for the [Solana AI Kit](https://github.com/solanabr/solana-ai-kit) and ships as a progressive, token-efficient loadable module for coding agents.

---

## The problem

Scrolling the agent-token meta on Solana = scrolling scam after scam. The "agent" keyword is flooded with pump-and-dump tokens, anonymous teams, and rugs waiting to happen. Manual vetting is slow and error-prone. AI agents need a fast, deterministic check before they touch any new token.

This skill reads a `TokenSafetyReport` (you build it from the fetch scripts) and returns:

- A single risk grade: `low` / `medium` / `high` / `critical`
- A 0–100 risk score
- Specific flags ("Top 10 wallets own 95%", "Mint authority active", etc.)
- A human-readable recommendation

## What this skill does

| Capability | Description |
|---|---|
| **Fetch holders** | `getTokenLargestAccounts` — top 20 holders + supply. |
| **Fetch authorities** | `getAccountInfo` — mint + freeze authority status, supply, decimals. |
| **Fetch social** | DexScreener pair info — Twitter / website / Telegram presence. |
| **Composite scoring** | Weighted scoring across 5 categories + veto overrides for severe findings. |

## Install

```bash
# Install dependencies
npm install

# Quick test
node scripts/assess_safety.mjs --json '{"mint": "Test", "authorities": {"mint_authority": "ActiveAddr"}}'
```

## Quick start (as an agent skill)

```bash
# 1. Pull holder data
node scripts/fetch_holders.mjs --mint <MINT> > /tmp/holders.json

# 2. Pull authority data
node scripts/fetch_authorities.mjs --mint <MINT> > /tmp/auth.json

# 3. Pull social data
node scripts/fetch_social.mjs --mint <MINT> > /tmp/social.json

# 4. Composite the report and score
{
  "mint": "<MINT>",
  "holders": $(jq .data /tmp/holders.json),
  "authorities": $(jq .data /tmp/auth.json),
  "social": $(jq .data.social /tmp/social.json)
} | node scripts/assess_safety.mjs
```

Example agent prompt:
> "Before I trade this token, score its safety."

## Architecture

```
agent-token-safety-skill/
├── SKILL.md                         # Entry point — agent reads this first
├── skill/                           # Progressive, focused knowledge files
│   ├── scoring.md
│   ├── building-reports.md
│   └── flags.md
├── scripts/                         # Working Node.js executables
│   ├── fetch_holders.mjs
│   ├── fetch_authorities.mjs
│   ├── fetch_social.mjs
│   └── assess_safety.mjs
├── examples/                        # Sample token reports
│   ├── clean_token.json
│   ├── rug_pull.json
│   └── questionable.json
├── tests/                           # 10 tests via node:test
│   └── assess_safety.test.mjs
├── install.sh
├── package.json
├── LICENSE                          # MIT
└── README.md                        # This file
```

## Why this skill exists

Foundry is an autonomous Solana trading agent. Before it touches a new agent token, it needs to know if it's a rug. This skill is extracted from Foundry's pre-trade safety check and exposed for other agents.

## License

MIT — see LICENSE.

---

Built by [Foundry](https://github.com/foundry-sol) for the [Solana AI Kit](https://github.com/solanabr/solana-ai-kit) by Superteam Brazil.