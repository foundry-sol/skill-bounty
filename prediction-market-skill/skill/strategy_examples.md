# Strategy Examples for Autonomous Agents

## Strategy 1: Time-Decay Fade

When a long-dated prediction market has low volume, the market maker's spread is wide. The agent can:

1. Find markets with >50 days to resolution
2. Calculate the fair price based on time decay
3. Take the OTHER side of the market maker's quoted spread
4. Profit from spread convergence as resolution approaches

**Risk:** Market doesn't resolve as expected.

## Strategy 2: Cross-Platform Arbitrage

Same event on multiple platforms may have different prices.

1. Search for the same event on Polymarket, Drift, Kalshi
2. Find the highest-YES-price platform
3. Find the lowest-NO-price platform (which is equivalent to highest-YES)
4. Buy YES on the cheaper platform
5. Sell YES on the expensive platform (if you can)

**Risk:** Can't always find the same event on both platforms. Withdrawal friction on EVM.

## Strategy 3: Sentiment-Based Edge

For markets tied to news cycles:

1. Use external signal source (news API, Twitter, etc.) to estimate probability
2. Compare to market price
3. If your estimate differs by >5%, consider trading

**Risk:** Signal source is wrong. Markets may already be priced in.

## Strategy 4: Liquidity Harvesting

Some markets have high fees for LPs.

1. Provide liquidity to AMM-style markets
2. Earn trading fees
3. Use this skill to track your LP positions

**Risk:** Impermanent loss in volatile markets.

## Strategy 5: Resolution Hedging

If you have a position in one platform:

1. Find the same event on another platform
2. Take the OPPOSITE position
3. Lock in profit regardless of resolution

**Risk:** Capital requirements. Different fee structures. Resolution criteria may differ.

## Strategy 6: News Event Trading

When major news hits:

1. Fetch markets related to the event
2. Check if news is already priced in
3. If edge exists, take position
4. Close before resolution (don't hold through binary outcomes)

**Risk:** News is mispriced. Resolution criteria ambiguous.

## Integration with Multi-Agent Orchestration

Use `multi-agent-orchestration-skill` to:
- Have 2-3 agents research the same market
- Use consensus to decide belief
- Distribute risk across multiple positions

Example:
```
Agent 1 (analyst): "I think 60% YES based on polling data"
Agent 2 (researcher): "I think 65% YES based on market sentiment"
Agent 3 (contrarian): "I think 50% YES, the poll is biased"

Consensus: 58% YES
Edge vs market (50%): +0.08
Confidence: 0.7
Position: 0.08 * 0.7 = 5.6% of bankroll
```

## When NOT to use this skill

- Sports betting (different math, different risk profile)
- Pure speculation with no information edge
- Markets with <$1000 daily volume (low liquidity, wide spreads)
- Markets you don't understand (lack of information = no edge)

## Risk management discipline

Even with a positive edge:
- Max 25% of bankroll per market
- Max 50% of bankroll across all markets
- Stop trading for 24 hours after 3 consecutive losses
- Review all positions weekly
- Track your realized edge (edge after fees)

If your realized edge is consistently < 2%, stop trading. The fees will eat you alive.