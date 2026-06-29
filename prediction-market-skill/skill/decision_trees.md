# Prediction Market Decision Trees

## "Should I trade this market?"

```
1. Do I have a belief about the outcome?
   │
   ├─ NO → SKIP. Don't trade on vibes.
   │
   └─ YES
      │
      ├─ How confident am I? (0-1)
      │
      └─ Run: belief, marketPrice, confidence, bankroll → calculateEdge
         │
         ├─ recommendation: SKIP
         │  └─ Edge too small (<2%) or kelly too small → Don't trade
         │
         ├─ recommendation: BUY YES
         │  └─ You think YES is more likely than market thinks
         │     └─ Position size = bankroll * kelly * confidence
         │        └─ Place trade
         │
         └─ recommendation: BUY NO
            └─ You think NO is more likely than market thinks
               └─ Same flow
```

## "How much should I bet?"

```
edge = belief - marketPrice
kelly_raw = |edge| / (1 - marketPrice) for YES, |edge| / marketPrice for NO
kelly_final = min(kelly_raw * confidence, 0.25)  # Cap at 25% of bankroll
position = bankroll * kelly_final
```

**Examples:**
| Belief | Market | Edge | Confidence | Kelly (raw) | Kelly (capped) | Position ($1000) |
|---|---|---|---|---|---|---|
| 0.65 | 0.50 | +0.15 | 0.7 | 0.30 | 0.21 | $210 |
| 0.55 | 0.50 | +0.05 | 0.5 | 0.10 | 0.05 | $50 |
| 0.99 | 0.01 | +0.98 | 1.0 | 0.99 | 0.25 | $250 |
| 0.51 | 0.50 | +0.01 | 0.5 | 0.02 | 0.01 | $10 |
| 0.45 | 0.50 | -0.05 | 0.7 | 0.07 | 0.05 | $50 (NO) |

## "When should I close a position?"

```
1. Did the market resolve?
   │
   ├─ YES → Close at market price (usually 1.0 or 0.0)
   │
   └─ NO → Did the market move against you?
      │
      ├─ NO (still profitable or unchanged) → Hold
      │
      └─ YES
         │
         ├─ Has edge reversed?
         │  │
         │  ├─ YES → Close (your information is no longer valid)
         │  │
         │  └─ NO (just volatility) → Hold with stop loss
         │
         └─ Time decay?
            │
            ├─ YES (close to resolution) → Consider closing
            │
            └─ NO → Hold
```

## "Which platform should I use?"

```
Want to trade prediction markets?
│
├─ On Solana? → Drift Protocol
│  (Native, low fees, perps available)
│
├─ US-based, regulated? → Kalshi
│  (CFTC-regulated, limited crypto markets)
│
├─ Largest liquidity + most markets? → Polymarket
│  (Ethereum, USDC, geo-restricted, withdrawal friction)
│
└─ No preference? → Use this skill to compare edge across all 3
```

## "How do I avoid losses?"

```
1. Set max position size = 25% of bankroll (built into this skill)
2. Set stop loss at 50% of position value
3. Diversify: never have >50% of bankroll in one platform
4. Track beliefs: log why you entered, exit if belief changes
5. Review weekly: look at your closed positions and learn
```

## "How do I improve my edge over time?"

```
1. Track EVERY trade: entry, exit, P&L
2. Note your reasoning at entry: "why did I think this was a good trade?"
3. Review closed positions weekly
4. Calculate your realized edge over many trades
5. If edge is consistently < 2%, stop trading (fees eat you up)
6. If edge is consistently > 10%, you're doing well, increase size
```

## "How do I size multiple concurrent positions?"

```
Total exposure across all markets: ≤ 50% of bankroll
Per market exposure: ≤ 25% of bankroll
Per platform exposure: ≤ 35% of bankroll
Reserve: ≥ 50% of bankroll in cash for new opportunities
```

Use `portfolio()` to check your current exposure before opening a new position.