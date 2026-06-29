# Integration Patterns for Autonomous Trading Agents

## Pattern 1: Pre-trade risk check (most common)

Before submitting any swap, run sandwich_detector. If risk is high, either:
- Tighten slippage
- Use Jito bundle with tip_estimator
- Split trade into smaller pieces
- Skip the trade

```javascript
import { estimateSandwichLoss } from './sandwich_detector.mjs';
import { estimateOptimalTip } from './jito_tip_estimator.mjs';

async function preTradeCheck(swapParams) {
  const risk = estimateSandwichLoss({
    amountIn: swapParams.amountIn,
    reserveIn: await getPoolReserves(swapParams.pool),
    reserveOut: await getPoolReserves(swapParams.pool),
    userSlippageBps: swapParams.slippageBps,
  });

  if (risk.riskLevel === 'high') {
    if (risk.attackerProfit > swapParams.valueUsd * 0.01) {
      // Attack would extract >1% of trade value - DEFINITELY skip
      return { action: 'skip', reason: 'high sandwich risk' };
    }
    // Use Jito bundle
    const tip = estimateOptimalTip({
      txValueUsd: swapParams.valueUsd,
      mempoolCongestion: await getCurrentCongestion(),
      isMevProtected: true,
    });
    return { action: 'jito', tip, slippageBps: Math.min(30, risk.userLossBps) };
  }

  if (risk.riskLevel === 'medium') {
    // Tighten slippage
    return { action: 'proceed', slippageBps: Math.min(50, swapParams.slippageBps) };
  }

  return { action: 'proceed', slippageBps: swapParams.slippageBps };
}
```

## Pattern 2: Continuous monitoring

Watch pool depth over time. If a pool thins (e.g., large withdrawal), increase risk sensitivity.

```javascript
async function monitorPoolRisk(poolAddress) {
  const reserves = await getPoolReserves(poolAddress);
  const historicalAverage = await getAverageReserves(poolAddress, '7d');

  const depthRatio = reserves.reserveIn / historicalAverage.reserveIn;

  if (depthRatio < 0.5) {
    // Pool is 50%+ thinner than usual
    return { riskMultiplier: 2.0, action: 'tighten-slippage-2x' };
  }
  return { riskMultiplier: 1.0 };
}
```

## Pattern 3: Multi-agent consensus on trades

Use `multi-agent-orchestration-skill` + `mev-sentry-skill` together:
- 2+ agents analyze the trade
- Both run sandwich_detector
- Both must agree risk is acceptable
- High-stakes trades require all agents to agree

## Pattern 4: Slippage ladder

Instead of fixed slippage, use a dynamic slippage based on:
- Pool depth
- Trade size
- Mempool congestion
- Time of day

```javascript
function dynamicSlippage(baseSlippageBps, risk) {
  // Tighten slippage as risk increases
  const riskMultiplier = {
    low: 1.0,
    medium: 0.5,
    high: 0.3,
  }[risk.riskLevel];

  return Math.max(10, Math.floor(baseSlippageBps * riskMultiplier));
}
```

## Pattern 5: Sandwich bot identification

For advanced agents, learn to recognize sandwich bots:
- They front-run large swaps within the same block
- They have predictable patterns (always around large swaps)
- They use specific Jito tip amounts

You can use this to:
- Avoid trading when bots are active
- Time trades for low-bot-activity windows
- Build "MEV-aware" reputation

## Pattern 6: Reporting

When MEV protection triggers, log it:

```javascript
const event = {
  timestamp: Date.now(),
  pool: swapParams.pool,
  tradeSize: swapParams.amountIn,
  riskLevel: risk.riskLevel,
  action: action.action,
  userLoss: risk.userLoss,
  attackerProfit: risk.attackerProfit,
  tipAmount: tip?.lamports,
};
await logMEVEvent(event);
```

This data helps you:
- Identify pools that frequently have sandwich risk
- Time your trades better
- Optimize slippage defaults

## Common mistakes to avoid

1. **Don't fix slippage at 100 bps for everything** — varies by pool
2. **Don't skip pre-trade check on "small" trades** — sandwich bots target any size if profitable
3. **Don't pay 10M lamports tip on every tx** — wastes SOL on non-MEV-prone txs
4. **Don't ignore pool depth** — most important risk factor
5. **Don't trust wallet defaults** — they're often wrong for your trade size

## When to use Jito vs not

**Use Jito when:**
- Trade > $10,000
- Pool is thin
- Slippage > 50 bps
- Time-sensitive (arbitrage, liquidation, etc.)
- MEV protection is worth the tip cost

**Skip Jito when:**
- Trade < $100
- Deep pool (SOL/USDC on Jupiter)
- Low slippage
- Not time-sensitive
- Tip cost would be > 1% of trade value

## Real-time vs batch

**Real-time risk check:**
- Run before every trade
- Fast (< 100ms)
- Recommended for most agents

**Batch analysis:**
- Run periodically on watchlist pools
- Identify safe windows to trade
- Good for autonomous agents that scan + trade

## See also

- `../solana-tx-simulation-skill` — pre-flight tx validation
- `../multi-agent-orchestration-skill` — multi-agent risk consensus
- `skill/threat_model.md` — full MEV threat model