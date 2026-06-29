# Impermanent Loss

IL is the difference in USD value between holding tokens in a CLMM position vs. just holding them in your wallet.

## When to read this

When the user asks about IL, "am I losing money on my LP," or any variation.

## The math

For a position with initial value `V_init` and price moving from `P_init` to `P_curr`:

**HODL value** (what you'd have if you just held the tokens):
```
V_hodl = V_init × (sqrt(P_curr / P_init) + sqrt(P_init / P_curr)) / 2
```

**Impermanent Loss (vs. HODL)**:
```
IL_pct = (V_position / V_hodl) - 1
```

For a position inside its chosen range `[P_lower, P_upper]`:
- The IL formula is similar but constrained by the bounds.
- IL is largest when price is at one of the bounds.

For an **out-of-range** position:
- Position holds 100% of one token.
- IL vs. HODL continues to grow as price moves further away.

## What `calculate_il.mjs` returns

```json
{
  "in_range": true,
  "price_ratio": 1.05,
  "price_lower": 100,
  "price_upper": 110,
  "current_price": 105,
  "initial_value_usd": 200,
  "current_value_usd": 210,
  "hodl_value_usd": 220,
  "il_pct": -0.045,        // current_position is 4.5% below HODL
  "il_usd": -10,
  "absolute_pnl_pct": 0.05, // +5% vs. initial (gain net of IL)
  "absolute_pnl_usd": 10,
  "fee_yield_pct_estimate": 0.10,
  "notes": []
}
```

### How to read it

- `il_pct` (negative): how much the LP is underperforming HODL.
- `absolute_pnl_pct` (positive or negative): overall return on the position including fees.
- `fee_yield_pct_estimate`: rough estimate of fees earned (IL + absolute_pnl, since absolute_pnl includes fees net of IL).
- The position is **profitable in absolute terms** when `absolute_pnl_pct > 0` (fees earned > IL).
- The position is **outperforming HODL** when `il_pct >= 0` (impossible in theory for a 2-sided position, but possible for stablecoin-correlated positions or with extreme fee capture).

## Common scenarios

| Scenario | IL | Absolute P&L | Verdict |
|---|---|---|---|
| Price stable in range | ~0% | positive (fees earned) | Healthy |
| Price moved 5% within range | -0.1% to -0.5% | positive | Healthy |
| Price moved 20% within range | -1% to -5% | may be positive | Monitor |
| Price moved out of range | -1% to -10% | depends on fees | Rebalance or close |
| Price moved 50%+ and out | -10%+ | depends on fees | Likely close |

## Why "impermanent"?

IL is "impermanent" because if price returns to where it started, IL disappears. In practice, the loss becomes permanent when you exit the position (close it, withdraw liquidity) at a price different from entry.