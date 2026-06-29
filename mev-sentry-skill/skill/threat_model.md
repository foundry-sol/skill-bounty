# MEV Threat Model on Solana

## What is MEV?

MEV = Maximal Extractable Value. Profit that block producers (validators) or searchers can extract by reordering, inserting, or censoring transactions within a block.

## Common MEV attacks on Solana

### 1. Sandwich Attack
**Most common. Most damaging.**

- **Attacker** front-runs victim's buy with a small buy
- **Victim's** trade executes at worse price
- **Attacker** back-runs with a sell, capturing the move

**Example:** Victim wants to buy TOKEN for 10 SOL
- Attacker buys 1 SOL worth of TOKEN first
- Victim buys at higher price
- Attacker sells at higher price
- Victim gets fewer TOKEN, attacker profits

### 2. Arbitrage
**Competitive but legal. Mostly bots.**

- Price discrepancy between DEXes
- Bot buys low on one, sells high on another
- Negative for users (extracts value from their trades) but neutral on aggregate

### 3. Liquidation
**Specialized, requires capital + oracle skills.**

- Loans getting close to liquidation threshold
- Bots race to be first to liquidate
- Receives liquidation bonus (typically 5-10%)

### 4. Jito Tip Auction
**Pure market mechanism.**

- All Jito bundles compete on tip
- Highest tip gets included
- Effectively a priority fee auction

## Defense strategies

### Tier 1: Slippage tuning
- Lower slippage = less sandwich profit
- Cost: more failed transactions
- Best for: low-urgency trades

### Tier 2: Jito bundle
- Send tx via Jito instead of public mempool
- Front-running bots can't see it
- Cost: tip (typically 1k-1M lamports)
- Best for: most trades

### Tier 3: Private RPC
- Send tx to a private RPC (Triton, etc.) that bypasses public mempool
- Front-running bots can't see it
- Cost: subscription fee
- Best for: large trades

### Tier 4: MEV-aware routing
- Use DEX aggregators that route through deep pools
- Reduces price impact = less sandwich profit
- Cost: aggregator fees (usually small)
- Best for: all trades

## How attackers find victims

1. **Mempool monitoring** — watch for pending transactions
2. **Pattern detection** — flag large swaps on thin pools
3. **Compute simulation** — front-run if profitable after gas
4. **Bundle with victim** — same block, atomic execution
5. **Back-run same path** — extract value after victim's trade

## What makes a swap a "good sandwich"

✓ Trade size > 1% of pool reserves
✓ Slippage > 50 bps (attacker can extract within slippage)
✓ Thin pool (low liquidity)
✓ Volatile token (price moves amplify the attack)
✓ Mempool is public (no Jito/protected RPC)

## What makes a swap "safe"

✗ Trade < 0.1% of pool (attacker can't move price enough)
✗ Slippage < 10 bps (not enough profit for attacker)
✗ Deep pool (price impact is small)
✗ Stablecoin pair (no volatility to extract)
✗ Private mempool (attacker can't see it)

## Solana-specific notes

- Solana's mempool is technically private to leaders, but RPCs cache txs
- Jito bundles bypass the public mempool entirely
- Block times are ~400ms — sandwich must be very fast
- Solana has lower MEV extraction than Ethereum (faster block times, different mempool design)
- But still significant — millions extracted per month

## Detection signals (for monitoring)

If you see:
- Trade size > 5% of pool: HIGH RISK
- Slippage > 100 bps: HIGH RISK
- Pool reserves declining: thin pool, RISKY
- Recent sandwich attacks on same pool: ELEVATED RISK

If you see:
- Trade size < 0.5% of pool: LOW RISK
- Slippage < 30 bps: LOW RISK
- Deep, established pool: LOW RISK
- Jito bundle: SAFE
- Private RPC: SAFE

## What this skill does (and doesn't)

✓ Detects sandwich risk before you trade
✓ Estimates optimal Jito tip
✓ Simulates attacker behavior for research
✗ Does not actually submit transactions
✗ Does not monitor mempool in real time
✗ Does not execute sandwiches (defensive only)

## Research vs. defense

The sandwich_simulator script models attacker behavior for **defensive research**. Understanding how attackers think helps you build better defenses. Do not use this code offensively — sandwich attacks:
- Are illegal in many jurisdictions
- Harm retail users
- Get you banned from protocols
- Have led to multi-million dollar lawsuits

This skill exists to PROTECT traders, not enable attackers.