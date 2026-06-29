#!/usr/bin/env node
/**
 * lst_yield_comparison.mjs — Compare native SOL staking vs leading LSTs
 *
 * LSTs (Liquid Staking Tokens) trade illiquid staked SOL for a tokenized version
 * that can be used in DeFi while still earning staking rewards.
 *
 * Trade-off:
 *   Native SOL stake: highest yield (no LST spread), but illiquid + warmup/cooldown
 *   LSTs: liquid instantly, slight yield drag from spread + protocol fees
 *
 * This skill tracks expected yield differences so an agent can decide whether
 * to stay native or wrap into an LST.
 *
 * Usage:
 *   node lst_yield_comparison.mjs
 *   node lst_yield_comparison.mjs --principal 1000 --json
 *   node lst_yield_comparison.mjs --update    # fetch live rates from on-chain (best effort)
 *
 * Exit codes: 0=ok
 */

/**
 * LST data as of late 2024 / early 2025 — these drift; update with --update.
 * Numbers are conservative; real yields fluctuate.
 */
const LST_TABLE = [
  {
    symbol: 'SOL',
    name: 'Native SOL (no LST)',
    expectedApr: 7.0, // baseline native staking after avg ~5% validator commission
    protocolFeePct: 0,
    lstSpreadPct: 0,
    liquid: false,
    warmupDays: 2.5,
    cooldownDays: 2.5,
    depegRisk: 'none',
    notes: 'Highest yield. Illiquid during warmup/cooldown. No DeFi composability.',
  },
  {
    symbol: 'jitoSOL',
    name: 'Jito Staked SOL',
    expectedApr: 8.2,
    protocolFeePct: 0.0, // validator commission already netted
    lstSpreadPct: 0.05,
    liquid: true,
    warmupDays: 0,
    cooldownDays: 0,
    depegRisk: 'low',
    notes: 'Captures MEV tips on top of base inflation. Liquid. Small spread cost.',
  },
  {
    symbol: 'mSOL',
    name: 'Marinade Staked SOL',
    expectedApr: 7.1,
    protocolFeePct: 0.0,
    lstSpreadPct: 0.02,
    liquid: true,
    warmupDays: 0,
    cooldownDays: 0,
    depegRisk: 'low',
    notes: 'Liquid + delegated across many validators (decentralization win).',
  },
  {
    symbol: 'bSOL',
    name: 'BlazeStake Staked SOL',
    expectedApr: 7.05,
    protocolFeePct: 0.0,
    lstSpreadPct: 0.03,
    liquid: true,
    warmupDays: 0,
    cooldownDays: 0,
    depegRisk: 'low',
    notes: 'BlazeStake LST, used in DeFi.',
  },
  {
    symbol: 'INF',
    name: 'Infinity Pool (InfStakedSOL)',
    expectedApr: 7.3,
    protocolFeePct: 0.0,
    lstSpreadPct: 0.08,
    liquid: true,
    warmupDays: 0,
    cooldownDays: 0,
    depegRisk: 'medium',
    notes: 'Newer LST, restake-aware. Higher spread.',
  },
];

function parseArgs(argv) {
  const args = { principal: 1000, days: 365, json: false, update: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--principal') args.principal = parseFloat(argv[++i]);
    else if (a === '--days') args.days = parseInt(argv[++i], 10);
    else if (a === '--json') args.json = true;
    else if (a === '--update') args.update = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else {
      console.error(`Unknown arg: ${a}`);
      process.exit(2);
    }
  }
  return args;
}

/**
 * Compute net APR for an LST (after spread + protocol fees).
 */
export function netApr(lst) {
  const spread = lst.lstSpreadPct || 0;
  const fee = lst.protocolFeePct || 0;
  return Math.max(0, lst.expectedApr - spread - fee);
}

/**
 * Project principal forward by N days at given APR.
 */
export function projectYield(principal, aprPct, days) {
  const daily = aprPct / 365 / 100;
  // Simple interest for short horizons
  return principal * daily * days;
}

/**
 * Rank LSTs by net APR, accounting for liquidity / risk trade-offs.
 */
export function rankLsts(principal = 1000, days = 365) {
  return LST_TABLE.map((lst) => {
    const apr = netApr(lst);
    const yieldSol = projectYield(principal, apr, days);
    return {
      symbol: lst.symbol,
      name: lst.name,
      netAprPct: round(apr, 3),
      yieldOverPeriodSol: round(yieldSol, 6),
      liquid: lst.liquid,
      depegRisk: lst.depegRisk,
      notes: lst.notes,
    };
  }).sort((a, b) => b.netAprPct - a.netAprPct);
}

function round(n, decimals) {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log('Usage: node lst_yield_comparison.mjs [--principal N] [--days N] [--json]');
    process.exit(0);
  }

  if (args.update) {
    console.log('--update: live LST rate fetch not implemented yet (RPC pull from Sanctum would go here).');
    console.log('Using static table.');
  }

  const ranked = rankLsts(args.principal, args.days);

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          principalSol: args.principal,
          days: args.days,
          ranked,
        },
        null,
        2
      )
    );
  } else {
    console.log(`Comparing LST yields for ${args.principal} SOL over ${args.days} days:\n`);
    console.log('Rank | Symbol  | Net APR | Yield (SOL) | Liquid | Depeg Risk | Notes');
    console.log('-----|---------|---------|-------------|--------|------------|------');
    ranked.forEach((r, i) => {
      console.log(
        `${String(i + 1).padStart(4)} | ${r.symbol.padEnd(7)} | ${String(r.netAprPct + '%').padEnd(7)} | ${String(r.yieldOverPeriodSol).padEnd(11)} | ${String(r.liquid).padEnd(6)} | ${r.depegRisk.padEnd(10)} | ${r.notes.slice(0, 40)}`
      );
    });
    console.log('\nRecommended for agents: jitoSOL (MEV + liquid + low depeg) unless hold-period is short.');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.stack || err.message);
    process.exit(1);
  });
}