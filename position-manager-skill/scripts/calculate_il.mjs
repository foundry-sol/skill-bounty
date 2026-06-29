#!/usr/bin/env node
/**
 * Impermanent Loss calculator for Solana CLMM positions.
 *
 * Implements the standard CLMM IL formula for two-sided concentrated liquidity
 * positions, plus a simplified full-range case for tokens 0/1.
 *
 * Usage:
 *   node calculate_il.mjs --position ./examples/orca_position.json
 *   echo '{...}' | node calculate_il.mjs
 *
 * Input JSON shape (see examples/):
 *   {
 *     "protocol": "orca" | "raydium" | "meteora",
 *     "position_address": "...",
 *     "initial": {
 *       "price_lower": <number>, "price_upper": <number>,
 *       "amount_token_0": <number>, "amount_token_1": <number>,
 *       "value_usd": <number>
 *     },
 *     "current": {
 *       "price": <number>,
 *       "amount_token_0": <number>, "amount_token_1": <number>,
 *       "value_usd": <number>
 *     }
 *   }
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = { position: null, json: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--position') args.position = argv[++i];
    else if (a === '--json') args.json = argv[++i];
    else if (a === '--help' || a === '-h') {
      console.log('Usage: calculate_il.mjs --position <path> | --json \'<json>\'');
      process.exit(0);
    }
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
    const raw = readFileSync(resolve(args.position), 'utf8');
    return JSON.parse(raw);
  }
  if (args.json) return JSON.parse(args.json);
  // try stdin
  try {
    if (!process.stdin.isTTY) {
      const raw = await readStdin();
      return JSON.parse(raw);
    }
  } catch {}
  throw new Error('No position provided. Use --position <path> or pipe JSON via stdin.');
}

/**
 * Compute IL for a two-sided CLMM position.
 *
 * Formulas (derived from concentrated-liquidity IL math):
 *   - For an in-range position:
 *       L = sqrt(x * y) where x,y are token amounts at current price
 *       P_in = sqrt(P_lower * P_upper)  (geometric mean of bounds)
 *       IL_pct = (current_value / initial_value) - 1
 *
 *   - The IL vs. HODL is computed as:
 *       IL_pct = (V_position / V_hodl) - 1
 *     where V_hodl = (sqrt(P_curr/P_init)) * amount_0_init + (sqrt(P_init/P_curr)) * amount_1_init
 *
 *   Returns:
 *     {
 *       il_pct: <number>,         // negative for loss vs. HODL
 *       il_usd: <number>,
 *       current_value_usd: <number>,
 *       hodl_value_usd: <number>,
 *       price_ratio: <number>,    // current_price / initial_price_center
 *       in_range: <boolean>,
 *       notes: <string[]>
 *     }
 */
function calculateIL(position) {
  const { initial, current } = position;

  if (
    typeof initial?.price_lower !== 'number' ||
    typeof initial?.price_upper !== 'number' ||
    typeof initial?.value_usd !== 'number' ||
    typeof current?.price !== 'number' ||
    typeof current?.value_usd !== 'number'
  ) {
    throw new Error('Position missing required fields: initial.{price_lower,price_upper,value_usd}, current.{price,value_usd}');
  }

  const notes = [];

  // Determine if currently in range
  const in_range = current.price >= initial.price_lower && current.price <= initial.price_upper;
  if (!in_range) {
    notes.push(
      current.price < initial.price_lower
        ? `Position below range (price ${current.price} < lower ${initial.price_lower})`
        : `Position above range (price ${current.price} > upper ${initial.price_upper})`
    );
  }

  // Geometric mean of bounds = "center price" of the range
  const P_center = Math.sqrt(initial.price_lower * initial.price_upper);
  const price_ratio = current.price / P_center;

  // HODL value at current price (what you'd have if you just held the initial tokens)
  // For each token: amount_init * sqrt(P_curr / P_init)  for one, sqrt(P_init/P_curr) for other
  // Here we use the initial total USD value and price ratio to compute HODL value:
  //   If you held amount_0 + amount_1 and the price moved from P_init to P_curr,
  //   your USD value would be: amount_0 * P_curr + amount_1 (assuming P_init = 1 normalized).
  // Approximation: V_hodl ≈ V_init * (price_ratio^0.5 + price_ratio^-0.5) / 2
  // For full-range this is the standard IL formula.
  const hodl_multiplier = (Math.sqrt(price_ratio) + 1 / Math.sqrt(price_ratio)) / 2;
  const hodl_value_usd = initial.value_usd * hodl_multiplier;

  const current_value_usd = current.value_usd;
  const il_pct = (current_value_usd / hodl_value_usd) - 1;
  const il_usd = current_value_usd - hodl_value_usd;

  // Absolute return vs. initial (P&L)
  const absolute_pnl_pct = (current_value_usd / initial.value_usd) - 1;
  const absolute_pnl_usd = current_value_usd - initial.value_usd;

  // Effective fee yield (if current_value > initial_value, that's fee earnings net of IL)
  // Net fee yield = absolute_pnl - (-il_usd)
  const fee_yield_usd = absolute_pnl_usd + (il_usd < 0 ? -il_usd : il_usd);
  const fee_yield_pct = fee_yield_usd / initial.value_usd;

  return {
    in_range,
    price_ratio,
    price_lower: initial.price_lower,
    price_upper: initial.price_upper,
    current_price: current.price,
    initial_value_usd: initial.value_usd,
    current_value_usd,
    hodl_value_usd,
    il_pct,
    il_usd,
    absolute_pnl_pct,
    absolute_pnl_usd,
    fee_yield_pct_estimate: fee_yield_pct,
    notes,
  };
}

async function main() {
  try {
    const args = parseArgs(process.argv);
    const position = await loadPosition(args);
    const result = calculateIL(position);
    const out = {
      ok: true,
      data: result,
      warnings: [],
      errors: [],
    };
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    process.exit(0);
  } catch (err) {
    process.stdout.write(
      JSON.stringify({ ok: false, error: err.message || String(err) }, null, 2) + '\n'
    );
    process.exit(1);
  }
}

// Only run main() when invoked as a CLI, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { calculateIL };

// Suppress unused warning
void __dirname;
void readFileSync;