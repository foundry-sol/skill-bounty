# Alerts

Detect positions that need attention: out-of-range, near-boundary, or with significant IL.

## When to read this

When the user asks "which positions need attention," "alert me on out-of-range," or "are any of my positions at risk."

## Severity levels

| Severity | Meaning | Action |
|---|---|---|
| `none` | Healthy | No action |
| `info` | Minor (e.g., position holding 100% of one token but still in range) | Optional monitor |
| `warning` | Near boundary or significant IL | Watch closely, consider rebalance |
| `critical` | Out of range | Rebalance or close ASAP |

## Status classification (`check_outofrange.mjs`)

| Status | Trigger |
|---|---|
| `in_range` | current_price strictly within [lower, upper] |
| `near_lower` | within `near_pct` (default 5%) of lower bound |
| `near_upper` | within `near_pct` of upper bound |
| `at_bound` | within 0.5% of either bound |
| `below_range` | current_price < lower |
| `above_range` | current_price > upper |

## Alert wiring

For automated alerts, the skill consumer (agent) should:

1. Run `fetch_positions.mjs` (or use mock data) to get positions.
2. For each position, run `check_outofrange.mjs` and `calculate_il.mjs`.
3. Combine outputs:
   - `severity === 'critical'` → immediate rebalance suggestion
   - `severity === 'warning'` + `il_pct < -0.05` → rebalance suggestion
   - `severity === 'warning'` + `il_pct > -0.05` → monitor
4. Optionally pipe through `suggest_rebalance.mjs` to get a proposed action.

## Example: alert logic in 10 lines

```javascript
import { checkRange } from './check_outofrange.mjs';
import { calculateIL } from './calculate_il.mjs';

function shouldAlert(position) {
  const range = checkRange(position);
  const il = calculateIL(position);
  if (range.severity === 'critical') return { alert: true, severity: 'critical', reason: range.recommendation };
  if (range.severity === 'warning' && il.il_pct < -0.05) return { alert: true, severity: 'warning', reason: `High IL: ${(il.il_pct * 100).toFixed(1)}%` };
  return { alert: false };
}
```

## Foundry integration

If `FOUNDRY_STATE_FILE` env var is set (Foundry risk manager state), the skill will refuse to suggest actions that breach:
- per-trade max USD (default $5 — too small for most LP rebalances, configurable)
- daily loss cap (default $10)
- cumulative kill switch (-75% of starting capital)

For LPs with positions > $5, the user must explicitly raise these rails before the skill will suggest a rebalance.