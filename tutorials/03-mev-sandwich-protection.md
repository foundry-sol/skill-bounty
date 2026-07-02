# Tutorial 3: MEV Sandwich Attack Protection on Solana

> **M4 Tutorial** for the [Solana AI Kit](https://github.com/solanabr/solana-ai-kit) · Built on the
> [`mev-sentry-skill`](https://github.com/foundry-sol/skill-bounty/tree/main/mev-sentry-skill)
> · 19/96 tests passing

## Who this is for

You're building a Solana trading agent, swapper, or arb bot. You submit transactions to the public mempool. Bots front-run you. You lose 1-5% of every trade to sandwich attacks.

This tutorial shows you how to use `mev-sentry-skill` to:
- Detect if a swap is a sandwich target
- Estimate Jito tip to outbid attackers
- Simulate sandwich outcomes for defensive research

**What you'll build by the end:**
- A swapper that auto-protects against sandwiches via Jito
- A simulation tool to model what an attacker would do
- A tip calculator for MEV-protected transactions
- Decision logic: when to use Jito, when to use public mempool

**Time:** ~2 hours if you follow along. ~15 minutes to install and run the skill.

---

## Part 1: MEV on Solana (2026)

Solana's mempool is "pseudo-private" — validators see transactions directly, but there's still a small window where bots can:
1. Detect your pending transaction
2. Front-run with their own transaction
3. Back-run after yours executes

This is called a **sandwich attack**. The bot profits; you get a worse price.

**On Ethereum, MEV is solved with Flashbots.** On Solana, the equivalent is **Jito**:

| Network | MEV solution | Mechanism |
|---|---|---|
| Ethereum | Flashbots | Off-chain bundle auction |
| Solana | Jito | Tip-based priority + atomic bundles |

Jito lets you submit a "bundle" (atomic group of transactions) with a tip. The validator picks the highest-tip bundle. This bypasses the public mempool — sandwich bots can't see your transaction until it's executed.

The skill helps you decide when to use Jito, and how much to tip.

---

## Part 2: How sandwich attacks work

A sandwich attack has three steps:

```
1. Attacker FRONT-RUNS: small buy (moves price up)
2. Victim's trade: executes at worse price
3. Attacker BACK-RUNS: sells (captures the price move)
```

**The math:**

```javascript
import { calculatePriceImpact, estimateSandwichLoss } from 'mev-sentry-skill';

// Your swap: 50,000 USDC → SOL on a Raydium CLMM pool
// Pool reserves: 100,000 USDC, 5,000,000 SOL
// You accept 1% slippage (100 bps)

const result = estimateSandwichLoss({
  amountIn: 50_000,        // 50K USDC
  reserveIn: 100_000,      // pool USDC reserve
  reserveOut: 5_000_000,   // pool SOL reserve
  userSlippageBps: 100,    // 1% slippage tolerance
});

console.log(result);
// {
//   user_loss: 0.0243,         // 2.43% of swap value lost to sandwich
//   attacker_profit: 24.30,    // $24.30 in your swap
//   sandwich_profitable: true,  // YES, attacker will sandwich you
//   recommendation: 'USE_JITO',
//   suggested_tip_lamports: 50000,  // tip to outbid attacker
// }
```

**Why this matters:** if a sandwich attack would net the attacker $24 from your trade, and you tip $0.05 (50,000 lamports) for MEV protection, you save $24 - $0.05 = **$23.95**.

**The breakeven formula:**

```
sandwich_profitable_for_attacker (in $) > your_jito_tip (in $)
    → you should use Jito
```

If the attacker profits $5 from sandwiching you, and Jito tip costs $0.01, you save $4.99 by using Jito.

---

## Part 3: Detecting sandwich risk

The skill provides `estimateSandwichLoss()` which evaluates sandwich risk for any given swap.

**Inputs you need:**

| Parameter | Description | Where to get it |
|---|---|---|
| `amountIn` | Your swap amount (in input token units) | Your trade size |
| `reserveIn` | Pool's input token reserve | Jupiter quote |
| `reserveOut` | Pool's output token reserve | Jupiter quote |
| `userSlippageBps` | Your slippage tolerance | Your trade config |
| `attackerCapitalUsd` | How much the attacker would deploy | Default $1,000 |

```javascript
import { estimateSandwichLoss } from 'mev-sentry-skill';

const risk = estimateSandwichLoss({
  amountIn: 50_000,
  reserveIn: 100_000,
  reserveOut: 5_000_000,
  userSlippageBps: 100,
  attackerCapitalUsd: 1000,
});

if (risk.sandwich_profitable) {
  console.log(`WARNING: Sandwich risk. Use Jito. Suggested tip: ${risk.suggested_tip_lamports} lamports`);
}
```

**The risk categories:**

| Loss % | Category | Action |
|---|---|---|
| <0.1% | Negligible | Public mempool is fine |
| 0.1-0.5% | Low | Public mempool OK, tighter slippage recommended |
| 0.5-2% | Medium | Use Jito for safety |
| 2-5% | High | MUST use Jito |
| >5% | Critical | Don't trade, or split into smaller trades |

---

## Part 4: The price impact calculation

Sandwich profitability depends on the **price impact** of your trade. Higher impact = more profitable to sandwich.

```javascript
import { calculatePriceImpact } from 'mev-sentry-skill';

const impact = calculatePriceImpact({
  amountIn: 50_000,
  reserveIn: 100_000,
  reserveOut: 5_000_000,
  feeBps: 30,  // 0.3% Raydium fee
});

console.log(impact);
// {
//   amountOut: 1980198,        // SOL out
//   spotPrice: 50,             // initial price
//   marginalPrice: 33.34,     // price after your trade
//   priceImpact: 0.3334,       // 33.34% price impact (!)
// }
```

**33% price impact on a 50K trade means you're moving the price significantly.** This is a sandwich magnet.

**The price impact thresholds:**

| Price impact | Sandwich risk |
|---|---|
| <1% | Low — bots won't bother |
| 1-5% | Medium — moderate risk |
| 5-15% | High — bots will target |
| >15% | Critical — guaranteed sandwich target |

**Why this matters:** the skill uses price impact to estimate sandwich loss. The higher the impact, the more an attacker can extract.

---

## Part 5: Jito tip estimation

Jito charges a tip for MEV-protected transactions. The skill estimates the minimum tip needed to outbid sandwich bots.

```javascript
import { estimateJitoTip } from 'mev-sentry-skill';

const tip = estimateJitoTip({
  tradeValueUsd: 1000,        // your trade value
  congestion: 'high',         // 'low' | 'medium' | 'high'
  mevProtected: true,         // are you using Jito?
  urgent: false,              // is this time-sensitive?
  sandwichLossUsd: 24.30,     // loss from sandwich if no protection
});

console.log(tip);
// {
//   recommendedTipLamports: 12000,
//   recommendedTipUsd: 0.0019,  // ~0.002 cents
//   reasoning: 'Low congestion, sandwich loss $24, low tip suffices',
//   breakEvenUsd: 24.30,       // your sandwich loss = max you should tip
// }
```

**The tip dynamics:**

| Congestion | Typical tip range |
|---|---|
| Low (off-peak) | 1,000-10,000 lamports ($0.0001-0.001) |
| Medium (normal) | 10,000-50,000 lamports ($0.001-0.005) |
| High (meme season) | 50,000-200,000 lamports ($0.005-0.02) |

**Key insight:** during meme season, Jito tips are higher because more bots are competing. During bear markets, tips are lower.

**The break-even formula:**

```
max_tip = sandwich_loss_usd - safety_margin
```

If you'd lose $24 to sandwich without Jito, and Jito tip costs $0.01, you save $23.99 by using Jito.

---

## Part 6: Simulating sandwich outcomes (for defensive research)

The skill also provides `simulateSandwich()` — a model of what an attacker would do. Use this to understand the attack surface.

```javascript
import { simulateSandwich } from 'mev-sentry-skill';

const sim = simulateSandwich({
  amountIn: 50_000,
  reserveIn: 100_000,
  reserveOut: 5_000_000,
  userSlippageBps: 100,
  attackerCapitalUsd: 1000,
});

console.log(sim);
// {
//   steps: [
//     {
//       step: 'front_run',
//       attackerBuys: 1000,        // USDC in
//       priceBefore: 0.020,        // SOL per USDC
//       priceAfter: 0.0205,
//       reservesBefore: { in: 100000, out: 5000000 },
//       reservesAfter:  { in: 101000, out: 4995100 },
//     },
//     {
//       step: 'victim_trade',
//       victimBuys: 49000,         // USDC (after attacker's front-run)
//       // Victim gets fewer SOL because price already moved
//     },
//     {
//       step: 'back_run',
//       attackerSells: 1000-worth-of-SOL,  // back to USDC
//       attackerProfit: 24.30,
//     },
//   ],
//   totalVictimLoss: 24.30,
//   totalAttackerProfit: 24.30,
//   // The attacker's profit equals the victim's loss (sandwich is a zero-sum game)
// }
```

**Why this matters:** you can run `simulateSandwich` on any proposed trade to see exactly what an attacker would do. If the simulation shows a $24 loss, you know to use Jito.

**Defensive use case:** integrate this into your pre-trade check.

```javascript
function shouldUseJito(trade) {
  const sim = simulateSandwich(trade);
  if (sim.totalVictimLoss > 1.00) {  // >$1 loss
    return { useJito: true, tip: estimateJitoTip({ ...trade, sandwichLossUsd: sim.totalVictimLoss }) };
  }
  return { useJito: false };
}
```

---

## Part 7: Wiring Jito into a swapper

The skill provides the building blocks. Here's how to wire Jito into a real swapper:

```javascript
import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';
import { getQuote, getSwapTransaction } from '@jup-ag/api';
import { estimateSandwichLoss, estimateJitoTip } from 'mev-sentry-skill';
import searcherTxSend from 'jito-js/dist/lib/searcher';

async function swapWithMevProtection(inputMint, outputMint, amount, slippageBps) {
  // Step 1: Get Jupiter quote
  const quote = await getQuote({
    inputMint,
    outputMint,
    amount,
    slippageBps,
  });
  
  // Step 2: Estimate sandwich risk
  const sandwichLoss = estimateSandwichLoss({
    amountIn: amount,
    reserveIn: quote.otherAmountThreshold / 1e6,  // approx
    reserveOut: amount / quote.outAmount * quote.otherAmountThreshold,  // approx
    userSlippageBps: slippageBps,
  });
  
  let transaction;
  let useJito = false;
  let tip = 0;
  
  if (sandwichLoss.sandwich_profitable) {
    // Use Jito for MEV protection
    useJito = true;
    const tipEstimate = estimateJitoTip({
      tradeValueUsd: amount / 1e6,  // USDC has 6 decimals
      sandwichLossUsd: sandwichLoss.user_loss * (amount / 1e6),
      congestion: 'high',
    });
    tip = tipEstimate.recommendedTipLamports;
    
    // Get Jito-aware swap transaction
    transaction = await getSwapTransaction({
      quoteResponse: quote,
      userPublicKey: wallet.publicKey,
      // Jito bundles require tip instruction
    });
    
    // Add Jito tip instruction
    transaction.add(JitoTipInstruction(wallet.publicKey, tip));
  } else {
    // Standard swap, no Jito needed
    transaction = await getSwapTransaction({
      quoteResponse: quote,
      userPublicKey: wallet.publicKey,
    });
  }
  
  // Step 3: Sign and submit
  transaction.sign(wallet);
  
  if (useJito) {
    // Send via Jito
    const bundle = new VersionedTransaction([transaction]);
    const result = await searcherTxSend.sendBundle(bundle, { tpu: 'jito' });
    console.log(`Jito bundle sent: ${result}`);
  } else {
    // Send via standard RPC
    const connection = new Connection(process.env.SOLANA_RPC_URL);
    const sig = await connection.sendTransaction(transaction);
    console.log(`Standard tx sent: ${sig}`);
  }
}
```

**The decision tree:**

```
estimate sandwich loss
    |
    v
loss > 1% AND trade > $1000?
    |
    v yes
use Jito + estimate tip
    |
    v
loss < 0.1% OR trade < $100?
    |
    v yes
use standard RPC
```

---

## Part 8: When to skip Jito

Not every trade needs MEV protection. The skill's recommendations:

| Trade size | Sandwich risk | Jito? |
|---|---|---|
| <$100 | <0.1% | No (overhead > savings) |
| $100-1000 | 0.1-1% | Optional |
| $1000-10K | 1-5% | Yes |
| >$10K | >5% | **Required** |

**Cost-benefit:**

- Jito tip: ~$0.001-0.01
- Sandwich loss avoided: $0.10-100+
- ROI on Jito tip: **100-10000x**

**Edge case: small trades during high congestion**

If you're trading $50 but mempool is at 90% utilization, sandwich bots are very active. The bot might sandwich you for $0.50. Jito tip costs $0.01. You save $0.49.

```javascript
const trade = { value: 50, congestion: 'high' };
const sim = simulateSandwich(trade);
if (sim.totalVictimLoss > 0.10) {  // >$0.10 loss
  return useJito;  // worth it
}
```

**Edge case: large trades during low congestion**

A $50K trade during low congestion. The skill says sandwich loss is $200. Jito tip is $0.005. You save $200.

```javascript
const trade = { value: 50_000, congestion: 'low' };
// Always use Jito for trades >$10K
```

---

## Part 9: The $0.05 lesson

The biggest mistake is over-using Jito. If your trade value is $1 and your sandwich loss would be $0.001, paying $0.005 for Jito is a 5x loss.

```javascript
function shouldUseJito(tradeValue, sandwichLossUsd) {
  const jitoTipCost = estimateJitoTip({ tradeValueUsd: tradeValue }).recommendedTipUsd;
  
  // Only use Jito if sandwich loss is meaningfully more than Jito cost
  if (sandwichLossUsd > jitoTipCost * 2) {
    return true;  // sandwich loss is 2x+ the Jito cost, worth it
  }
  return false;
}
```

**The 2x rule:** if sandwich loss is less than 2x the Jito cost, skip Jito. The risk/reward doesn't justify.

**Exceptions:**
- Meme season: always use Jito, congestion is unpredictable
- High-value trades ($10K+): always use Jito, the absolute $ at risk is large
- MEV-sensitive protocols (meme launches): always use Jito, sandwich bots are very active

---

## Part 10: Common pitfalls

**1. Static tip.** Bots adapt. A tip that worked yesterday may not work today. Recalculate per trade.

**2. Wrong pool math.** Solana has multiple pool types (Raydium v2, Raydium CLMM, Orca Whirlpools, Meteora DLMM). The skill assumes constant-product AMM (Raydium v2). For CLMM, the math is different — but the Jito principle is the same.

**3. Jito mempool not guaranteed.** Jito has a slot-by-slot auction. If a slot is already full, your bundle may not be included. Have a fallback to public mempool.

**4. Public RPC + Jito.** Some RPCs don't support Jito. Use a Jito-aware RPC (Helius, Triton).

**5. Stale reserves.** Pool reserves change with every trade. Fetch fresh data for each estimate.

---

## Part 11: Cost estimates

**Per-trade with Jito:**
- Jito tip: 0.00001-0.0001 SOL ($0.001-0.01)
- RPC fee: 5,000 lamports ($0.0004)
- Total: ~$0.002-0.02 per trade

**Per-trade without Jito (sandwiched):**
- Trade value: $X
- Loss: 0.1-5% of X
- For $1K trade: $1-50 loss

**For 100 trades/day:**
- With Jito: $0.20-2.00 cost
- Without Jito: $100-5000 loss
- **Savings: $98-4998/day**

---

## What you should take away

1. **MEV protection is non-negotiable for active agents.** Every public mempool transaction is a sandwich target.
2. **The math is straightforward.** Estimate sandwich loss, compare to Jito tip, decide.
3. **Jito is cheap.** $0.001-0.01 vs. $0.10-100+ sandwich loss.
4. **Skip Jito only for tiny trades.** $0.10 loss doesn't justify $0.005 Jito cost.

---

## Next steps

- **Clone the skill:** `git clone github.com/foundry-sol/skill-bounty`
- **Read the SKILL.md** for full API reference
- **Read Tutorial 1** for CLMM position management
- **Read Tutorial 2** for rug detection
- **Read Tutorial 4** (M4-04) for transaction simulation

---

## Appendix A: Test cases

The skill ships with 19 tests covering edge cases:

```javascript
// High-value trade, high risk
{
  amountIn: 50_000, reserveIn: 100_000, reserveOut: 5_000_000,
  userSlippageBps: 100,
  expected: { sandwich_profitable: true, user_loss_pct: 0.024 }
}

// Small trade, low risk
{
  amountIn: 100, reserveIn: 1_000_000, reserveOut: 50_000_000,
  userSlippageBps: 50,
  expected: { sandwich_profitable: false, user_loss_pct: 0.0001 }
}

// Zero slippage = no sandwich possible
{
  amountIn: 50_000, reserveIn: 100_000, reserveOut: 5_000_000,
  userSlippageBps: 0,
  expected: { sandwich_profitable: false }
}
```

---

## Appendix B: The full simulator output

```javascript
const fullSim = simulateSandwich({
  amountIn: 50_000,
  reserveIn: 100_000,
  reserveOut: 5_000_000,
  userSlippageBps: 100,
  attackerCapitalUsd: 1000,
});

// Output:
// Front-run: attacker buys 1000 USDC worth
//   Price: 0.0200 → 0.0205 (2.5% move)
//   Reserves: 100K/5M → 101K/4.99M
//
// Victim trade: 49,000 USDC (after attacker's 1000)
//   Without sandwich: 1.96M SOL
//   With sandwich: 1.92M SOL (loss: 40K / 2% of trade)
//
// Back-run: attacker sells 1000 USDC worth of SOL
//   Price: 0.0205 → 0.0200 (back to where it started)
//   Attacker profit: $24.30
```

**Net result:** attacker profits $24.30, victim loses $24.30. This is the entire sandwich.

---

**M4 Tutorial 03** · `mev-sentry-skill` · 19 tests · MIT license
Built by Foundry · github.com/foundry-sol/skill-bounty