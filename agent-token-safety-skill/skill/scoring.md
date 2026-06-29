# Scoring

How `assess_safety.mjs` arrives at a risk grade.

## Components

The scorer evaluates 5 categories, each producing a 0–100 component score:

| Component | What it measures |
|---|---|
| `holder_concentration` | Top wallet ownership, top-10 ownership, total holder count |
| `authorities` | Mint authority + freeze authority status |
| `liquidity` | USD liquidity depth, volume/liquidity ratio, pool age |
| `social_presence` | Twitter + website presence, follower count |
| `trading_patterns` | Buy/sell ratio, volume churn, price volatility |

## Weights

```js
const WEIGHTS = {
  holder_concentration: 0.30,
  authorities: 0.30,
  liquidity: 0.20,
  social_presence: 0.10,
  trading_patterns: 0.10,
};
```

Why these weights? Holder concentration and authorities are the strongest rug-pull predictors — the data is on-chain, hard to fake. Liquidity is next. Social presence and trading patterns are weaker signals (can be faked via paid growth / wash trading).

## Composite score

```
composite = sum(component_score * weight) for each component
```

`composite` is rounded to an integer 0–100.

## Grade thresholds

| Composite | Grade |
|---|---|
| 0–24 | `low` |
| 25–49 | `medium` |
| 50–74 | `high` |
| 75–100 | `critical` |

## Veto rules

The composite score is a useful summary, but certain individual findings are severe enough to override:

- **Active `mint_authority`** — team can mint unlimited tokens → escalates to at least `high`.
- **Active `freeze_authority`** — team can freeze your tokens → escalates to at least `high`.

These overrides exist because the weighted score can mask a single critical finding. E.g., a brand-new token with active mint authority but only 50 holders and no liquidity would score ~10 (mostly 0s), but the active mint authority is a deal-breaker.

## Missing data

If a field is missing from the report, the component for that field scores 0 and no flag is raised. This is "no signal" — not "all clear." The agent should fetch more data before trading.

## Examples

### Clean token → low

```json
{
  "holders": { "total_holders": 5000, "top_10_pct": 15 },
  "authorities": { "mint_authority": null, "freeze_authority": null },
  "liquidity": { "liquidity_usd": 500000, "pool_age_days": 90 },
  "social": { "has_twitter": true, "twitter_followers": 10000 },
  "trading": { "buy_sell_ratio": 1.1 }
}
```
→ composite ~10, grade `low`, no flags.

### Rug pattern → critical

```json
{
  "holders": { "total_holders": 50, "top_10_pct": 95 },
  "authorities": { "mint_authority": "ActiveAuth", "freeze_authority": null },
  "liquidity": { "liquidity_usd": 500, "pool_age_days": 1 },
  "social": { "has_twitter": false, "has_website": false },
  "trading": { "buy_sell_ratio": 0.1 }
}
```
→ composite 90+, grade `critical`, multiple flags.