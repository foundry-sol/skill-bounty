#!/usr/bin/env node
/**
 * Out-of-range detector for Solana CLMM positions.
 *
 * Determines whether a position's current price is within its chosen range,
 * and classifies urgency (in-range, near-boundary, out-of-range).
 *
 * Usage:
 *   node check_outofrange.mjs --position ./examples/orca_position.json
 *   echo '{...}' | node check_outofrange.mjs
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function parseArgs(argv) {
  const args = { position: null, json: null, near_pct: 5 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--position') args.position = argv[++i];
    else if (a === '--json') args.json = argv[++i];
    else if (a === '--near-pct') args.near_pct = parseFloat(argv[++i]);
  }
  return args;
}

async function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

async function loadPosition(args) {
  if (args.position) {
    return JSON.parse(readFileSync(resolve(args.position), 'utf8'));
  }
  if (args.json) return JSON.parse(args.json);
  if (!process.stdin.isTTY) {
    return JSON.parse(await readStdin());
  }
  throw new Error('No position provided.');
}

/**
 * Classify position range status.
 *
 * Logic:
 *   - in_range: current price is strictly within [lower, upper]
 *   - near_lower / near_upper: within near_pct% of the corresponding bound (default 5%)
 *   - below_range / above_range: current price is outside the bounds
 *   - inactive: at one of the exact bounds (no fees earned)
 *
 * Returns:
 *   {
 *     status: "in_range" | "near_lower" | "near_upper" | "below_range" | "above_range" | "at_bound" | "unknown",
 *     severity: "none" | "info" | "warning" | "critical",
 *     distance_to_lower_pct: <number>,
 *     distance_to_upper_pct: <number>,
 *     recommendation: <string>
 *   }
 */
function checkRange(position, nearPct = 5) {
  const { initial, current } = position;
  const price = current?.price;
  const lower = initial?.price_lower;
  const upper = initial?.price_upper;

  if (typeof price !== 'number' || typeof lower !== 'number' || typeof upper !== 'number') {
    return {
      status: 'unknown',
      severity: 'warning',
      distance_to_lower_pct: null,
      distance_to_upper_pct: null,
      recommendation: 'Position data missing required price fields.',
    };
  }

  // Compute relative distance from current price to each bound (in %)
  // distance is negative if past the bound (out of range), positive if still within
  const distance_to_lower_pct = ((price - lower) / lower) * 100;
  const distance_to_upper_pct = ((upper - price) / upper) * 100;

  let status, severity, recommendation;

  if (price < lower) {
    status = 'below_range';
    severity = 'critical';
    recommendation = `Out of range. Price $${price} is below lower bound $${lower}. Position is fully in ${initial?.amount_token_0_symbol || 'token_0'} and earning 0 fees. Consider rebalance to a lower range.`;
  } else if (price > upper) {
    status = 'above_range';
    severity = 'critical';
    recommendation = `Out of range. Price $${price} is above upper bound $${upper}. Position is fully in ${initial?.amount_token_1_symbol || 'token_1'} and earning 0 fees. Consider rebalance to a higher range.`;
  } else if (Math.abs(distance_to_lower_pct) < 0.5 || Math.abs(distance_to_upper_pct) < 0.5) {
    status = 'at_bound';
    severity = 'warning';
    recommendation = 'Position is essentially at a range boundary. Fees will drop to zero if price moves further out. Consider widening the range or pre-emptively rebalancing.';
  } else if (distance_to_lower_pct < nearPct) {
    status = 'near_lower';
    severity = 'warning';
    recommendation = `Position is within ${nearPct}% of the lower bound. Watch closely — small moves can push it out of range.`;
  } else if (distance_to_upper_pct < nearPct) {
    status = 'near_upper';
    severity = 'warning';
    recommendation = `Position is within ${nearPct}% of the upper bound. Watch closely — small moves can push it out of range.`;
  } else {
    status = 'in_range';
    severity = 'none';
    const midPct = ((price - lower) / (upper - lower)) * 100;
    recommendation = `Position is healthy. Current price is at ${midPct.toFixed(1)}% of the range (lower→upper).`;
  }

  return {
    status,
    severity,
    distance_to_lower_pct,
    distance_to_upper_pct,
    current_price: price,
    price_lower: lower,
    price_upper: upper,
    recommendation,
  };
}

async function main() {
  try {
    const args = parseArgs(process.argv);
    const position = await loadPosition(args);
    const result = checkRange(position, args.near_pct);
    process.stdout.write(JSON.stringify({ ok: true, data: result, warnings: [], errors: [] }, null, 2) + '\n');
    process.exit(0);
  } catch (err) {
    process.stdout.write(JSON.stringify({ ok: false, error: err.message || String(err) }, null, 2) + '\n');
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { checkRange };