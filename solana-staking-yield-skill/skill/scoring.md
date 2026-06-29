# Scoring Methodology

The `score_validator.mjs` script ranks Solana validators on a 0-100 scale.

## Component weights

| Component | Max points | What it measures |
|---|---|---|
| Commission | 25 | % of rewards taken by validator (lower = better) |
| Stake concentration | 20 | % of network stake (penalize >5%, reward decentralization) |
| Delinquency | 25 | 25 if active, 0 if delinquent |
| Uptime | 20 | Last-epoch credits proxy (~1.5M = full, <500k = degraded) |
| Headroom | 10 | Lower if commission is 0% (can be raised later) |

Total max = 100.

## Flags

The script returns these flags on top of the score:

| Flag | Trigger |
|---|---|
| `high_commission` | Commission > 10% |
| `zero_commission_can_increase` | Commission = 0% (warning: validator can raise to 100%) |
| `large_validator` | Stake share 5-10% |
| `centralization_risk` | Stake share > 10% |
| `delinquent` | Status != active |
| `no_recent_credits` | Last-epoch credits = 0 |

## Trade-offs the scoring does not capture

This scoring is **read-only** and does not consider:

- **MEV tip capture** — Jito-enabled validators earn additional MEV tips on top of base inflation. This is captured in `lst_yield_comparison.mjs` but not in per-validator scoring because on-chain MEV tip data is harder to fetch.
- **Validator history** — historical slash events, downtime patterns. Could be added via a longer-term data source.
- **Software client** — Firedancer vs Agave vs Jito-Solana. Some agents prefer specific clients for risk diversification.
- **Geographic location** — agents optimizing for latency or jurisdiction may want to filter by region.

For an agent that needs MEV-aware scoring, the recommended approach is:

1. Run `fetch_validators.mjs` to get the validator set
2. Cross-reference against a Jito tip leaderboard (external data source)
3. Boost the score for high-MEV validators
4. Then use `score_validator.mjs` as the base ranking

## What "good" looks like

For a low-risk agent wallet:

- Score >= 75
- No `centralization_risk` flag
- No `delinquent` flag
- Commission <= 10%
- Stake share < 3%

For a higher-risk agent that's OK with centralization trade-offs (e.g., prioritizing uptime):

- Score >= 65
- Commission <= 5%
- Active status

## Limitations

- Snapshot-based scoring. A validator's score can change epoch-to-epoch.
- Doesn't account for inflation changes. Solana governance can change inflation rate.
- Stake concentration is relative to total active stake — a single "whale" validator joining can shift other validators' relative share.

## See also

- `../simulate_stake.mjs` — for projecting actual returns after validator selection
- `../lst_yield_comparison.mjs` — for choosing between native and LSTs