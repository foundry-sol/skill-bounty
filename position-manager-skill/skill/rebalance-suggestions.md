# Rebalance Suggestions

Propose a new tick range when a position needs rebalancing.

## When to read this

When the user asks "should I rebalance," "what's a better range," or "how do I fix this position."

## Heuristic actions

`scripts/suggest_rebalance.mjs` returns one of three actions:

### `rebalance` (out of range)
- Triggered when `current_price` is outside `[lower, upper]`.
- **Strategy:** Re-center the new range on `current_price`, keeping the same width as the old range.
- **Confidence:** medium (price may continue moving in the same direction).

### `widen` (near bound)
- Triggered when `current_price` is within 5% of either bound.
- **Strategy:** Asymmetrically expand the range away from the closer bound (by 25%).
- **Confidence:** low (heuristic, verify manually).

### `hold` (healthy)
- Triggered when `current_price` is comfortably inside the range.
- **Strategy:** No action.
- **Confidence:** high.

## Output shape

```json
{
  "ok": true,
  "data": {
    "action": "rebalance",
    "reason": "Out of range below lower bound...",
    "current_range": { "lower": 100, "upper": 110, "current_price": 90, "in_range": false, "width_pct": 10 },
    "proposed_range": { "lower": 85, "upper": 95, "width_pct": 11.76, "centered_on": 90 },
    "expected_improvement": {
      "il_reduction_estimate_pct": 0.5,
      "fee_capture_estimate_pct": 1.0,
      "gas_cost_usd_estimate": 0.0008
    },
    "confidence": "medium",
    "warnings": []
  }
}
```

## When NOT to use these heuristics

The rebalance suggestions are heuristic and assume the user wants to stay in the same general price area. For:

- **High-volatility markets:** manually widen beyond the heuristic's default 25%.
- **Stablecoin pairs:** use very narrow ranges; the heuristic may under-tighten.
- **Long-tail altcoins:** consider if position size justifies the gas cost (small positions on Meteora DLMM may not).

Always check the `warnings` field for any explicit caveats.

## Composability

`scripts/suggest_rebalance.mjs` is purely heuristic — it doesn't execute any transactions. To actually rebalance:

1. Call `suggest_rebalance.mjs --position <pos>` to get a proposal.
2. (Optional) Pipe through Foundry risk manager.
3. Manually review the proposal.
4. Use the protocol's SDK (e.g., `@orca-so/whirlpools-sdk`) to:
   - Remove liquidity from the existing position
   - Open a new position with the proposed range
5. Verify the new position via `fetch_positions.mjs`.