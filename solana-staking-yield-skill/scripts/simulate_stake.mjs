#!/usr/bin/env node
/**
 * simulate_stake.mjs — Estimate staking returns for a given principal
 *
 * Inputs:
 *   --principal SOL        (required)
 *   --commission 0-100     (default 5)
 *   --epochs N             (default 1, ~2-3 days)
 *   --network mainnet|testnet
 *   --inflation X          (default 4.5%, current Solana inflation)
 *   --json
 *
 * Solana staking math:
 *   - inflation rate set by governance, currently ~4.5% annualized
 *   - validator takes commission on rewards
 *   - one epoch ~2-3 days
 *   - yield = principal * inflation * (1 - commission) * epochs / 365 * 2.5 (epochs per year)
 *
 * Exit codes: 0=ok, 1=bad input
 */

function parseArgs(argv) {
  const args = {
    principal: null,
    commission: 5,
    epochs: 1,
    network: 'mainnet',
    inflation: 4.5,
    json: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--principal') args.principal = parseFloat(argv[++i]);
    else if (a === '--commission') args.commission = parseFloat(argv[++i]);
    else if (a === '--epochs') args.epochs = parseInt(argv[++i], 10);
    else if (a === '--network') args.network = argv[++i];
    else if (a === '--inflation') args.inflation = parseFloat(argv[++i]);
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
 * Compute expected stake yield in SOL over N epochs.
 *
 * @param {number} principalSol
 * @param {number} commissionPct 0-100
 * @param {number} epochs
 * @param {number} inflationPct annualized
 * @returns {object} { grossSol, netSol, aprPct, dailyRatePct, ... }
 */
export function simulateStake(principalSol, commissionPct, epochs, inflationPct = 4.5) {
  if (principalSol <= 0) throw new Error('Principal must be > 0');
  if (commissionPct < 0 || commissionPct > 100) throw new Error('Commission must be 0-100');
  if (epochs <= 0) throw new Error('Epochs must be > 0');

  // Solana epoch ≈ 2.5 days (was 2-3 historically; 2.5 is current spec)
  const daysPerEpoch = 2.5;
  const epochsPerYear = 365 / daysPerEpoch;

  // Annual inflation rate applied to principal
  const annualGross = principalSol * (inflationPct / 100);
  // Validator takes commission; staker gets the rest
  const annualNet = annualGross * (1 - commissionPct / 100);

  // Per-epoch yield
  const grossPerEpoch = annualGross / epochsPerYear;
  const netPerEpoch = annualNet / epochsPerYear;

  // Total over N epochs (linear, ignoring compounding for short horizons)
  const totalGross = grossPerEpoch * epochs;
  const totalNet = netPerEpoch * epochs;
  const totalDays = epochs * daysPerEpoch;

  return {
    principalSol,
    commissionPct,
    epochs,
    inflationPct,
    daysPerEpoch,
    epochsPerYear: Math.round(epochsPerYear * 100) / 100,
    grossPerEpochSol: round(grossPerEpoch, 6),
    netPerEpochSol: round(netPerEpoch, 6),
    totalGrossSol: round(totalGross, 6),
    totalNetSol: round(totalNet, 6),
    aprPct: round(inflationPct * (1 - commissionPct / 100), 3),
    dailyRatePct: round((inflationPct * (1 - commissionPct / 100)) / 365, 5),
    totalDays: round(totalDays, 2),
  };
}

function round(n, decimals) {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help || args.principal == null) {
    console.log('Usage: node simulate_stake.mjs --principal 100 --commission 5 --epochs 30 [--json]');
    process.exit(args.help ? 0 : 1);
  }

  const result = simulateStake(args.principal, args.commission, args.epochs, args.inflation);
  result.network = args.network;

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Network: ${result.network}`);
    console.log(`Principal: ${result.principalSol} SOL`);
    console.log(`Validator commission: ${result.commissionPct}%`);
    console.log(`Inflation rate: ${result.inflationPct}% APR`);
    console.log(`Epochs simulated: ${result.epochs} (~${result.totalDays} days)`);
    console.log('');
    console.log(`APR (your net): ${result.aprPct}%`);
    console.log(`Daily yield: ${result.dailyRatePct}%`);
    console.log('');
    console.log(`Gross per epoch: ${result.grossPerEpochSol} SOL`);
    console.log(`Net per epoch:   ${result.netPerEpochSol} SOL`);
    console.log(`Total net over ${result.epochs} epochs: ${result.totalNetSol} SOL`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}