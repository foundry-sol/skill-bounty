# Red Flags — Examples

Real-world patterns the scorer is built to catch.

## Critical (composite ≥ 75)

### Active mint authority + low liquidity
```json
{
  "authorities": { "mint_authority": "ActiveAuth...", "freeze_authority": null },
  "liquidity": { "liquidity_usd": 500 }
}
```
**Why it's a rug:** Team can mint unlimited tokens, dump them, and your position becomes worthless. Common pattern: launch with low supply, build hype, mint the rest, dump, exit.

### Holder concentration > 80% in top 10
```json
{
  "holders": { "total_holders": 50, "top_10_pct": 95 }
}
```
**Why it's a rug:** If 10 wallets control 95% of supply, they can dump on everyone else. Often these are insider wallets.

### Brand new pool with no socials
```json
{
  "liquidity": { "liquidity_usd": 1000, "pool_age_days": 1 },
  "social": { "has_twitter": false, "has_website": false }
}
```
**Why it's a rug:** Anonymous team + brand new + tiny liquidity = textbook honeypot setup. The "agent" label is a marketing veneer.

## High (composite 50–74)

### Active freeze authority
```json
{
  "authorities": { "freeze_authority": "ActiveAuth..." }
}
```
**Why it's a red flag:** Team can freeze your tokens, preventing you from selling. Used in scams where victims see the price rising but can't exit.

### Holder concentration 60–80%
```json
{
  "holders": { "total_holders": 200, "top_10_pct": 70 }
}
```
**Why it's concerning:** Large concentration = high dump risk. Even if not a rug, volatility is high.

### Very low liquidity + sells-heavy
```json
{
  "liquidity": { "liquidity_usd": 2000 },
  "trading": { "buy_sell_ratio": 0.2, "volume_24h": 10000 }
}
```
**Why it's concerning:** Heavy selling + thin liquidity = price dropping fast. Even legitimate projects see this when confidence is leaving.

## Medium (composite 25–49)

### Top 10 owns 40-60%
```json
{ "holders": { "top_10_pct": 50 } }
```
**Why it's a yellow flag:** Concentrated but not extreme. Watch for changes.

### No website
```json
{ "social": { "has_twitter": true, "has_website": false, "twitter_followers": 200 } }
```
**Why it's a yellow flag:** Twitter-only projects can disappear overnight. Legitimate projects have docs.

### Wash trading pattern
```json
{ "trading": { "buy_sell_ratio": 5.0, "volume_24h": 1000, "liquidity_usd": 5000 } }
```
**Why it's a yellow flag:** High buy/sell ratio with high vol/liq ratio is often wash trading inflating volume.

## Low (composite 0–24)

A clean token: distributed holders, no authorities, deep liquidity, real team, normal trading.

## Anti-patterns the scorer is NOT designed to catch

- Slow rug (months of accumulation then dump)
- Soft rug (team gradually abandons, no exit liquidity but no outright theft)
- Governance attacks (low holder count + high gov token weight)
- Smart contract exploits (separate concern — use an audit skill)
- Wash trading disguised as organic volume (heuristics catch obvious cases only)

For these, use a dedicated security skill or human review.