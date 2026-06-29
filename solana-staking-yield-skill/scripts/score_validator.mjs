#!/usr/bin/env node
/**
 * score_validator.mjs — Rank a Solana validator by quality score
 *
 * Score components (0-100):
 *   - Commission: lower is better (max 25 pts)
 *   - Stake concentration: penalized if too big (centralization risk) (max 20 pts)
 *   - Delinquency: 0 if active, 0 if delinquent (max 25 pts)
 *   - Epoch credits: higher is better (max 20 pts)
 *   - Commission headroom: small bonus if commission can go up (max 10 pts)
 *
 * Returns: ranked list of validators with composite score
 *
 * Usage:
 *   node score_validator.mjs --input validators.json
 *   node score_validator.mjs --input validators.json --limit 20
 *   echo '...' | node score_validator.mjs --stdin
 *
 * Exit codes: 0=ok, 1=bad input
 */

import fs from 'node:fs';

function parseArgs(argv) {
  const args = { limit: 20, input: null, stdin: false, json: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--input') args.input = argv[++i];
    else if (a === '--limit') args.limit = parseInt(argv[++i], 10);
    else if (a === '--stdin') args.stdin = true;
    else if (a === '--json') args.json = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else {
      console.error(`Unknown arg: ${a}`);
      process.exit(2);
    }
  }
  return args;
}

/**
 * Score a single validator. Returns { total, components, flags }.
 *
 * Scoring rationale:
 * - Commission > 10% is generally considered uncompetitive
 * - Stake > 5% = concentration risk
 * - Delinquent = hard fail
 * - Epoch credits = uptime proxy
 */
export function scoreValidator(v) {
  const components = {};
  const flags = [];

  // 1. Commission (25 pts) — 0% = 25, 100% = 0
  components.commission = Math.round(Math.max(0, 25 - (v.commissionPct / 100) * 25));
  if (v.commissionPct > 10) flags.push('high_commission');
  if (v.commissionPct === 0) flags.push('zero_commission_can_increase');

  // 2. Stake concentration (20 pts) — sweet spot 1-3%, big penalty > 5%
  const share = v.stakeSharePct;
  if (share < 0.1) components.stakeConcentration = 20; // tiny but online = ideal
  else if (share <= 3) components.stakeConcentration = 20;
  else if (share <= 5) components.stakeConcentration = 15;
  else if (share <= 10) {
    components.stakeConcentration = 8;
    flags.push('large_validator');
  } else {
    components.stakeConcentration = 2;
    flags.push('centralization_risk');
  }

  // 3. Delinquency (25 pts)
  if (v.status === 'active') components.delinquency = 25;
  else {
    components.delinquency = 0;
    flags.push('delinquent');
  }

  // 4. Epoch credits (20 pts) — typical 1 epoch = 1 credit, 432k credits = max
  // Most active validators sit at 1.3-1.5M credits for recent epoch activity
  const credits = v.lastEpochCredits || 0;
  if (credits >= 1_300_000) components.uptime = 20;
  else if (credits >= 1_000_000) components.uptime = 16;
  else if (credits >= 500_000) components.uptime = 10;
  else if (credits > 0) components.uptime = 4;
  else {
    components.uptime = 0;
    flags.push('no_recent_credits');
  }

  // 5. Headroom bonus (10 pts) — 0% commission validators can raise it; -10 risk
  // For now, give full points to non-zero commission validators (less surprise risk)
  components.headroom = v.commissionPct > 0 ? 10 : 5;

  const total = Object.values(components).reduce((s, n) => s + n, 0);
  // Hard cap if delinquent — no validator with active issues deserves >40
  const cappedTotal = v.status !== 'active' ? Math.min(total, 35) : total;

  return {
    votePubkey: v.votePubkey,
    name: v.name,
    commissionPct: v.commissionPct,
    activatedStakeSol: v.activatedStakeSol,
    stakeSharePct: v.stakeSharePct,
    status: v.status,
    score: cappedTotal,
    components,
    flags,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log('Usage: node score_validator.mjs --input validators.json [--limit N] [--json]');
    process.exit(0);
  }

  let raw;
  if (args.stdin) {
    raw = await new Promise((resolve) => {
      let buf = '';
      process.stdin.on('data', (d) => (buf += d));
      process.stdin.on('end', () => resolve(buf));
    });
  } else if (args.input) {
    raw = fs.readFileSync(args.input, 'utf8');
  } else {
    console.error('Need --input FILE or --stdin');
    process.exit(2);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error('Invalid JSON:', err.message);
    process.exit(1);
  }

  const validators = parsed.validators || parsed;
  if (!Array.isArray(validators)) {
    console.error('Expected { validators: [...] } or [...]');
    process.exit(1);
  }

  const scored = validators
    .map(scoreValidator)
    .sort((a, b) => b.score - a.score)
    .slice(0, args.limit);

  if (args.json) {
    console.log(JSON.stringify({ ranked: scored, count: scored.length }, null, 2));
  } else {
    console.log('Rank | Score | Commission | Stake (SOL)  | Status   | Flags');
    console.log('-----|-------|------------|--------------|----------|------');
    scored.forEach((v, i) => {
      console.log(
        `${String(i + 1).padStart(4)} | ${String(v.score).padStart(5)} | ${String(v.commissionPct + '%').padEnd(10)} | ${String(v.activatedStakeSol.toLocaleString()).padEnd(12)} | ${v.status.padEnd(8)} | ${v.flags.join(', ') || 'ok'}`
      );
    });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.stack || err.message);
    process.exit(1);
  });
}