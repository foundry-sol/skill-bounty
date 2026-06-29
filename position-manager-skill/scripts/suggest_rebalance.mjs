#!/usr/bin/env node
/**
 * Rebalance suggestion engine for Solana CLMM positions.
 *
 * Given a position and current market state, proposes a new range based on:
 *   - recent price action (assumes position will continue in similar range)
 *   - volatility heuristics (wider range = less IL, narrower = more fees)
 *   - current out-of-range status
 *
 * Usage:
 *   node suggest_rebalance.mjs --position ./examples/orca_position.json
 *
 * Heuristics (kept simple, deterministic):
 *   1. If out of range, suggest centering the new range on the current price
 *      with the same proportional width as the old range.
 *   2. If in range but near a bound, suggest widening toward the side that
 *      has more distance (asymmetric expansion).
 *   3. Otherwise, no rebalance suggested — current range is healthy.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DEFAULT_WIDTH_MULT = 1.5; // for out-of-range re-centers
const ASYMMETRIC_PAD_PCT = 25; // % to widen toward the safer side

function parseArgs(argv) {
  const args = { position: null, json: null, current_price: null, gas_lamports: 5000 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--position') args.position = argv[++i];
    else if (a === '--json') args.json = argv[++i];
    else if (a === '--current-price') args.current_price = parseFloat(argv[++i]);
    else if (a === '--gas-lamports') args.gas_lamports = parseFloat(argv[++i]);
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
 * Suggest a rebalance for a CLMM position.
 *
 * Returns:
 *   {
 *     action: "rebalance" | "widen" | "hold",
 *     reason: <string>,
 *     current_range: { lower, upper, current_price, in_range },
 *     proposed_range: { lower, upper, width_pct, centered_on },
 *     expected_improvement: {
 *       il_reduction_estimate_pct: <number>,
 *       fee_capture_estimate_pct: <number>,
 *       gas_cost_usd_estimate: <number>
 *     },
 *     confidence: "low" | "medium" | "high",
 *     warnings: <string[]>
 *   }
 */
function suggestRebalance(position, opts = {}) {
  const currentPrice = opts.current_price ?? position?.current?.price;
  const gasLamports = opts.gas_lamports ?? 5000;
  const initial = position?.initial;
  const current = position?.current;

  if (
    typeof currentPrice !== 'number' ||
    typeof initial?.price_lower !== 'number' ||
    typeof initial?.price_upper !== 'number'
  ) {
    throw new Error('Missing required fields: initial.price_lower, initial.price_upper, current.price');
  }

  const lower = initial.price_lower;
  const upper = initial.price_upper;
  const range_width_pct = ((upper - lower) / lower) * 100;

  const in_range = currentPrice >= lower && currentPrice <= upper;
  const distance_lower_pct = ((currentPrice - lower) / lower) * 100;
  const distance_upper_pct = ((upper - currentPrice) / upper) * 100;

  let action, reason, proposed_lower, proposed_upper, confidence;
  const warnings = [];

  if (!in_range) {
    // Out of range → re-center around current price with same width.
    action = 'rebalance';
    reason = currentPrice < lower
      ? `Out of range below lower bound. Recent price is $${currentPrice}, below $${lower}. Re-centering range on current price.`
      : `Out of range above upper bound. Recent price is $${currentPrice}, above $${upper}. Re-centering range on current price.`;
    const halfWidth = (upper - lower) / 2;
    proposed_lower = Math.max(0.000001, currentPrice - halfWidth);
    proposed_upper = currentPrice + halfWidth;
    confidence = 'medium';
  } else if (distance_lower_pct < 5 || distance_upper_pct < 5) {
    // Near bound → asymmetric widen away from the closer bound.
    action = 'widen';
    const closer = distance_lower_pct < distance_upper_pct ? 'lower' : 'upper';
    reason = `Near ${closer} bound (within 5%). Asymmetric expansion recommended.`;
    const expand_pct = ASYMMETRIC_PAD_PCT / 100;
    if (closer === 'lower') {
      proposed_lower = lower * (1 - expand_pct);
      proposed_upper = upper;
    } else {
      proposed_lower = lower;
      proposed_upper = upper * (1 + expand_pct);
    }
    confidence = 'low';
    warnings.push('Asymmetric rebalance is heuristic; verify manually before executing.');
  } else {
    action = 'hold';
    reason = `Position is healthy. Current price $${currentPrice} is at ${((currentPrice - lower) / (upper - lower) * 100).toFixed(1)}% of the range. No rebalance recommended.`;
    proposed_lower = lower;
    proposed_upper = upper;
    confidence = 'high';
  }

  // Heuristic estimates
  const proposed_width_pct = ((proposed_upper - proposed_lower) / proposed_lower) * 100;
  const il_reduction_estimate_pct = action === 'rebalance' ? 0.5 : action === 'widen' ? 0.2 : 0;
  const fee_capture_estimate_pct = action === 'rebalance' ? 1.0 : action === 'widen' ? 0.3 : 0;
  const gas_cost_usd_estimate = (gasLamports / 1e9) * 150; // assume $150 SOL

  return {
    action,
    reason,
    current_range: {
      lower,
      upper,
      current_price: currentPrice,
      in_range,
      width_pct: range_width_pct,
    },
    proposed_range: {
      lower: proposed_lower,
      upper: proposed_upper,
      width_pct: proposed_width_pct,
      centered_on: action === 'hold' ? null : (proposed_lower + proposed_upper) / 2,
    },
    expected_improvement: {
      il_reduction_estimate_pct,
      fee_capture_estimate_pct,
      gas_cost_usd_estimate,
    },
    confidence,
    warnings,
  };
}

async function main() {
  try {
    const args = parseArgs(process.argv);
    const position = await loadPosition(args);
    const result = suggestRebalance(position, {
      current_price: args.current_price,
      gas_lamports: args.gas_lamports,
    });
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

export { suggestRebalance };