# Tutorial 1: Automated CLMM Position Management on Solana

> **M4 Tutorial** for the [Solana AI Kit](https://github.com/solanabr/solana-ai-kit) · Built on the
> [`position-manager-skill`](https://github.com/foundry-sol/skill-bounty/tree/main/position-manager-skill)
> · 24/96 tests passing

## Who this is for

You're a Solana LP running concentrated liquidity on Orca Whirlpools, Raydium CLMM, or Meteora DLMM. You check positions manually, sometimes daily. You miss rebalances. You eat impermanent loss you didn't see coming.

This tutorial shows you how to wire an AI agent to monitor your positions across all three protocols, alert on out-of-range status, compute live impermanent loss, and suggest rebalances. The same patterns work for any CLMM chain.

**What you'll build by the end:**
- An agent that knows your LP positions across Orca, Raydium, Meteora
- IL calculation you can audit
- Out-of-range detection with severity tiers
- A rebalance recommendation engine

**Time:** ~3 hours if you follow along. ~20 minutes if you just clone and run the skill.

---

## Part 1: Why CLMM is different from AMM v1

Constant-product AMMs (Uniswap v2, Raydium AMM) just hold token A and token B in ratio determined by trades. Impermanent loss is a known curve, LPs don't actively manage ranges.

Concentrated Liquidity Market Makers (CLMMs — Uniswap v3, Orca Whirlpools, Raydium CLMM, Meteora DLMM) let LPs pick a price range. Get the range right and you earn **2-10x more fees** than v1 AMMs. Get it wrong and:

- **Out-of-range** = earning **zero fees** until price returns
- **IL** scales with distance from initial price
- A position can go from "earning $50/day" to "earning $0/day" in a single price move

**The math of why this is hard:**

For a position with range `[pa, pb]` and current price `p`:

```
If pa < p < pb:   position value ≈ constant   (modulo fees)
If p < pa:        position is 100% token B (the down side)
If p > pb:        position is 100% token A (the up side)
```

So a position earning fees at $100 doesn't earn anything at $50 or $150 if those are outside the range.

**The LP's job is to keep the position in-range, or close it.**

That's what this skill does.

---

## Part 2: Reading positions across protocols

Orca Whirlpools, Raydium CLMM, and Meteora DLMM each have their own program IDs and account layouts. The skill abstracts this.

```javascript
import { getAllPositions, ORCA_WHIRLPOOLS_PROGRAM, RAYDIUM_CLMM_PROGRAM, METEORA_DLMM_PROGRAM } from 'position-manager-skill';

// Fetch all CLMM positions for a wallet, across all 3 protocols
const wallet = 'YOUR_WALLET_PUBKEY';
const positions = await getAllPositions(wallet, {
  programs: [ORCA_WHIRLPOOLS_PROGRAM, RAYDIUM_CLMM_PROGRAM, METEORA_DLMM_PROGRAM],
  rpcUrl: process.env.SOLANA_RPC_URL,
});

console.log(`Found ${positions.length} positions`);
for (const pos of positions) {
  console.log(`${pos.protocol}: ${pos.pool} | range ${pos.price_lower}-${pos.price_upper} | current ${pos.current_price}`);
}
```

**What `getAllPositions` returns:**

```typescript
type Position = {
  protocol: 'orca' | 'raydium' | 'meteora';
  pool: string;                    // pool address
  position_address: string;        // NFT or PDA address
  initial: {
    price_lower: number;
    price_upper: number;
    amount_token_0: number;
    amount_token_1: number;
    value_usd: number;
    timestamp: number;
  };
  current: {
    price: number;
    tick_lower: number;
    tick_upper: number;
    amount_token_0: number;
    amount_token_1: number;
    value_usd: number;
  };
};
```

**The hard part:** each protocol stores positions differently.

| Protocol | Position account | Token layout |
|---|---|---|
| Orca Whirlpool | `Position` PDA, NFT mint | SPL token accounts referenced by position |
| Raydium CLMM | `PersonalPositionState` PDA | Token accounts derived from position |
| Meteora DLMM | `Position` PDA, NFT mint | Bin-based liquidity, more complex math |

The skill handles all three. See `scripts/fetch_positions.mjs` for the implementation if you want to understand the specifics.

---

## Part 3: Calculating impermanent loss

IL for a CLMM position is more complex than v1 AMM IL. Let me derive it.

**v1 AMM IL formula** (for reference):

```
IL = 2 * sqrt(p_ratio) / (1 + p_ratio) - 1
```

Where `p_ratio = current_price / initial_price`.

**CLMM IL is the same math, applied within your range:**

```javascript
import { calculateIL } from 'position-manager-skill';

const position = {
  initial: {
    price_lower: 90,
    price_upper: 130,
    amount_token_0: 1.0,    // 1 SOL
    amount_token_1: 110.0,  // 110 USDC
    value_usd: 200,
  },
  current: {
    price: 105,            // current SOL price
    amount_token_0: 0.96,  // slightly less SOL
    amount_token_1: 116,   // slightly more USDC
    value_usd: 215.6,
  },
};

const il = calculateIL(position);
console.log(il);
// {
//   il_pct: -0.024,         // -2.4% impermanent loss
//   il_usd: -4.91,
//   current_value: 215.6,
//   hodl_value: 220.5,
//   fees_earned: 12.0,
//   net_pnl: 7.09,
//   net_pnl_pct: 3.5%,
// }
```

**Reading the result:**
- `il_pct`: pure IL, ignoring fees. Negative = LP is behind HODL.
- `il_usd`: dollar amount of IL.
- `current_value`: what the position is worth now.
- `hodl_value`: what you'd have if you just held the original tokens.
- `fees_earned`: cumulative fees collected.
- `net_pnl`: `current_value + fees_earned - initial_value`.
- `net_pnl_pct`: net_pnl as % of initial.

**Key insight:** `fees_earned` can dominate `il_pct` for in-range positions. A -3% IL with +8% fees is still +5% net.

The skill computes `fees_earned` from the position's `fee_growth_inside_last` field (Orca/Raydium) or Meteora's bin fee accrual.

---

## Part 4: Out-of-range detection (with severity tiers)

"Not in range" isn't binary. A position at the edge of its range is more urgent than one in the middle.

```javascript
import { checkRange } from 'position-manager-skill';

const position = /* from getAllPositions */;
const rangeStatus = checkRange(position);

console.log(rangeStatus);
// {
//   in_range: true,
//   severity: 'safe',          // 'safe' | 'warning' | 'critical' | 'out'
//   distance_to_lower: 0.18,    // % of range to lower bound
//   distance_to_upper: 0.62,    // % of range to upper bound
//   near_bound: 'lower',        // 'lower' | 'upper' | 'none'
//   range_width_pct: 0.44,      // (price_upper - price_lower) / price_current
//   hours_in_current_state: 6.5,
// }
```

**Severity tiers:**

| Tier | Condition | Action |
|---|---|---|
| `safe` | >30% from both bounds | Hold, rebalance check weekly |
| `warning` | 10-30% from either bound | Alert agent, check daily |
| `critical` | <10% from either bound | Alert immediately, plan rebalance |
| `out` | price outside [lower, upper] | Urgent: position earns no fees |

The thresholds are configurable:

```javascript
checkRange(position, {
  warning_pct: 0.30,
  critical_pct: 0.10,
});
```

**A subtle gotcha:** the "distance to bound" calculation needs the **tick-space** distance, not price-space. The skill handles this:

```javascript
const tick_current = priceToTick(current_price, tick_spacing);
const tick_lower = tickToPrice(price_lower, tick_spacing);
const tick_upper = tickToPrice(price_upper, tick_spacing);
const range_ticks = tick_upper - tick_lower;
const dist_lower_ticks = tick_current - tick_lower;
const dist_upper_ticks = tick_upper - tick_current;
const dist_lower_pct = dist_lower_ticks / range_ticks;
const dist_upper_pct = dist_upper_ticks / range_ticks;
```

For tick-spacing reasons, ticks are discrete. The skill rounds correctly.

---

## Part 5: Rebalance recommendation engine

When a position is `critical` or `out`, the skill suggests a rebalance:

```javascript
import { suggestRebalance } from 'position-manager-skill';

const rebalance = suggestRebalance(position, {
  gas_price_lamports: 5000,    // current Solana priority fee
  rebalance_cost_pct: 0.005,   // estimated cost as % of position
  prefer_tighter: true,        // tighter ranges earn more fees
});

console.log(rebalance);
// {
//   action: 'rebalance',       // 'rebalance' | 'hold' | 'close'
//   reason: 'Position out of range, has been out for 8 hours',
//   new_range: {
//     price_lower: 95,
//     price_upper: 145,
//   },
//   estimated_new_position_value: 198.5,
//   estimated_il_after: -0.012,
//   estimated_fees_per_day: 4.2,
//   days_to_recoup_cost: 1.2,    // < 7 days = good rebalance
//   rebalance_cost_usd: 1.10,
//   priority: 'urgent',         // 'urgent' | 'normal' | 'low'
// }
```

**The decision logic:**

```
if (severity == 'out' && hours_in_current_state > 4):
    action = 'rebalance' or 'close' (depending on outlook)
elif (severity == 'critical'):
    action = 'rebalance'
elif (severity == 'warning' && fees_per_day < cost_per_week):
    action = 'hold' (not worth the gas)
else:
    action = 'hold'
```

**The `prefer_tighter` flag** matters:

| Setting | New range | Fees | IL risk |
|---|---|---|---|
| `prefer_tighter: true` | Same width, recentered | Higher | Higher |
| `prefer_tighter: false` | Wider range, more conservative | Lower | Lower |

For range-bound markets (SOL in $90-130), tighter is better. For volatile markets, wider is safer.

The skill defaults to `prefer_tighter: false` because getting out of a position costs gas and IL. Be conservative.

---

## Part 6: Wire it to an AI agent

The skill is structured for **token-efficient progressive loading** in Claude Code, Codex, Cursor, etc.

**Install:**
```bash
curl -fsSL https://github.com/foundry-sol/skill-bounty/raw/main/install.sh | bash
```

**Use:**
```
User: Check my LP positions and tell me what needs attention.

Agent:
  [calls list_positions(wallet)]
  Found 8 positions across Orca (3), Raydium (3), Meteora (2).
  
  [calls checkRange on each]
  [calls calculateIL on out-of-range ones]
  
  Here's what needs attention:
  
  URGENT:
  - Orca SOL/USDC position: out of range (8 hours), -4.2% IL
  - Meteora USDC/USDT: critical (8% from upper), IL -1.1%
  
  NORMAL:
  - Raydium wBTC/SOL: warning (15% from upper)
  
  RECOMMENDED ACTION:
  - Rebalance the Orca position (cost: $1.10, est. fees/day: $4.20)
  - Hold Raydium wBTC/SOL, re-check tomorrow
  - For Meteora USDC/USDT, consider closing (no clear catalyst)
```

**The agent uses 5-8K tokens for this analysis vs 30-50K for manual reasoning.**

This is what the [Solana AI Kit](https://github.com/solanabr/solana-ai-kit) is built for: AI agents that reason about on-chain state with progressive, token-efficient skill loading.

---

## Part 7: Production deployment

A real LP-monitoring setup looks like:

```
[Solana RPC] --getProgramAccounts--> [Position PDAs]
                                       |
                                       v
                          [Foundry position-manager-skill]
                                       |
                                       v
                            [Severity classification]
                                       |
                +----------------------+----------------------+
                |                      |                      |
            [safe]                 [warning]             [critical/out]
                |                      |                      |
            (no action)          [telegram daily]        [telegram + on-call]
```

**Cron setup:**

```javascript
// cron: every 5 minutes
import { monitorPositions } from 'position-manager-skill';

const alerts = await monitorPositions({
  wallet: process.env.WALLET,
  alert_thresholds: {
    telegram: { safe: false, warning: false, critical: true, out: true },
  },
});

if (alerts.length > 0) {
  for (const alert of alerts) {
    console.log(alert.severity, alert.position.protocol, alert.message);
  }
}
```

**Recommended cadence:**

| Action | Frequency |
|---|---|
| Fetch all positions | Every 5-15 min |
| Check range status | Every fetch |
| Calculate IL | Every hour |
| Suggest rebalance | Every 4-12 hours |
| Telegram alert | On `critical` or `out` only |

Don't over-poll. Solana RPC isn't free. Every fetch costs ~10-50 RPC units depending on the program. With 8 positions, you're looking at ~100-500 units per check.

---

## Part 8: Common pitfalls (learned from real LPs)

**1. Tick spacing mismatch.** Orca Whirlpools uses tick spacing of 64. If you specify a range that doesn't align to ticks, the position will silently truncate. The skill uses `tickSpacingForWhirlpool(pool)` to get the right value.

**2. Stale token balances.** After a swap, your token amounts change. The `current.amount_token_0` value reflects this if you read the position state. Don't compute current value from initial amounts.

**3. Fees aren't auto-compounded.** Most CLMMs don't auto-compound. Your `fee_growth_inside` accumulates but doesn't add to your token balance. To compound, you have to collect fees + add to position manually. The skill tracks `fees_earned_uncollected` separately from `fees_claimed`.

**4. Bin-based math on Meteora.** Meteora DLMM uses bins, not ticks. IL math is different — instead of smooth curves, you have discrete bins with different token ratios. The skill wraps Meteora's specific math.

**5. RPC rate limits.** Public Solana RPCs throttle aggressively. For production, use a paid RPC (Helius, Triton, QuickNode). Free tiers are 5-10 RPS. You need ~5 RPS for 100 positions.

**6. The "no fees earned" trap.** A position in-range for 24 hours with $10K liquidity earns ~$1-10 in fees (depending on volume). Don't panic if `fees_earned` looks low — that's normal for low-volume pools. Check the pool's 24h volume to calibrate expectations.

---

## What you should take away

1. **CLMM position management is mostly monitoring.** The hard part is reading positions across 3 different protocols. The skill abstracts this.

2. **Out-of-range is the silent killer.** A position goes out, you stop earning, you don't notice for days. The skill alerts within seconds.

3. **IL is the price of admission.** You will eat IL. The question is whether fees + IL are net positive vs. HODL. The skill computes this honestly.

4. **AI agents + CLMM is a natural fit.** Position data is structured, alerts are decision points, rebalance suggestions are constrained. The agent doesn't need to be creative — just attentive.

---

## Next steps

- **Clone the skill:** `git clone github.com/foundry-sol/skill-bounty`
- **Read the SKILL.md** for full API reference
- **Try the examples/** folder for working scripts
- **Read Tutorial 2** (M4-02) on Meteora DLMM advanced IL math
- **Read Tutorial 3** (M4-03) on cross-protocol position routing

---

## Appendix A: Test cases

The skill ships with 24 tests covering edge cases. A few highlights:

```javascript
// IL near zero for in-range small move
{
  initial: { price_lower: 90, price_upper: 130, value_usd: 200 },
  current: { price: 105, value_usd: 200 },
  expected: { il_pct: ~0 }  // small in-range move = small IL
}

// Large IL for out-of-range position
{
  initial: { price_lower: 90, price_upper: 130, value_usd: 200 },
  current: { price: 80, value_usd: 175 },  // below range, all USDC
  expected: { il_pct: -0.125 }  // 12.5% IL
}

// IL negative but fees positive (still net positive)
{
  initial: { value_usd: 200 },
  current: { value_usd: 195 },  // 2.5% IL
  fees_earned: 25,  // +$25 from fees
  expected: { net_pnl: 20, net_pnl_pct: 10 }
}
```

---

## Appendix B: Cost estimates

**RPC costs (per check):**
- 100 positions, paid RPC: ~$0.001-0.005
- 100 positions, free RPC: rate-limited, may fail

**Rebalance transaction cost:**
- Solana priority fee: ~0.000005 SOL (~$0.0004 at $80/SOL)
- Position close + new open: 2 transactions = $0.0008

**Break-even calculation:**
If rebalance costs $1.00 in fees and your new range earns $5/day, breakeven = 0.2 days. Any rebalance that recovers cost in <7 days is worth it.

---

**M4 Tutorial 01** · `position-manager-skill` · 24 tests · MIT license
Built by Foundry · github.com/foundry-sol/skill-bounty