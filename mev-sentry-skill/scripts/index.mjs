#!/usr/bin/env node
/**
 * mev-sentry CLI: protect Solana transactions from MEV.
 *
 * Usage:
 *   solana-mev-sentry sandwich --amount 50000 --reserve-in 100000 --reserve-out 5000000 --slippage 100
 *   solana-mev-sentry tip --value 50000 --congestion high --mev-protected
 *   solana-mev-sentry simulate --amount 50000 --reserve-in 100000 --reserve-out 5000000
 *   solana-mev-sentry demo
 */

import { estimateSandwichLoss, calculatePriceImpact } from './sandwich_detector.mjs';
import { estimateOptimalTip } from './jito_tip_estimator.mjs';
import { simulateSandwich } from './sandwich_simulator.mjs';

const HELP = `
solana-mev-sentry — MEV protection for Solana agents

Commands:
  sandwich    Estimate sandwich attack risk for a swap
  tip         Estimate optimal Jito tip
  simulate    Simulate sandwich outcomes with various attacker sizes
  demo        Run all demos

Examples:
  solana-mev-sentry sandwich --amount 50000 --reserve-in 100000 --reserve-out 5000000 --slippage 100
  solana-mev-sentry tip --value 50000 --congestion high --mev-protected
  solana-mev-sentry simulate --amount 50000 --reserve-in 100000 --reserve-out 5000000

Run 'solana-mev-sentry <command> --help' for command-specific options.
`;

function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (!cmd || cmd === '--help' || cmd === '-h') {
    console.log(HELP);
    return;
  }

  const opts = parseArgs(args);

  if (cmd === 'demo') {
    runDemo();
    return;
  }

  if (cmd === 'sandwich') {
    const result = estimateSandwichLoss({
      amountIn: parseFloat(opts.amount),
      reserveIn: parseFloat(opts['reserve-in']),
      reserveOut: parseFloat(opts['reserve-out']),
      userSlippageBps: parseInt(opts.slippage || 100),
      attackerCapitalUsd: parseFloat(opts['attacker-capital'] || 5000),
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (cmd === 'tip') {
    const result = estimateOptimalTip({
      txValueUsd: parseFloat(opts.value || 0),
      mempoolCongestion: opts.congestion || 'normal',
      isTimeSensitive: opts.urgent === 'true',
      isMevProtected: opts['mev-protected'] === 'true',
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (cmd === 'simulate') {
    const scenarios = simulateSandwich({
      amountIn: parseFloat(opts.amount),
      reserveIn: parseFloat(opts['reserve-in']),
      reserveOut: parseFloat(opts['reserve-out']),
    });
    console.log('AttackerCap | VictimLoss | AttackerProfit | ROI');
    console.log('------------|------------|----------------|--------');
    for (const s of scenarios) {
      console.log(
        `${String(s.attackerCapital).padStart(11)} | ${String(s.victimLoss.toFixed(2)).padStart(10)} | ${String(s.attackerProfit.toFixed(2)).padStart(14)} | ${s.attackerRoi}%`
      );
    }
    return;
  }

  console.log(`Unknown command: ${cmd}\n${HELP}`);
}

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1];
      if (val && !val.startsWith('--')) {
        opts[key] = val;
        i++;
      } else {
        opts[key] = 'true';
      }
    }
  }
  return opts;
}

function runDemo() {
  console.log('=== MEV-Sentry Demo ===\n');

  console.log('1. Sandwich risk analysis (large trade on thin pool):');
  const sw = estimateSandwichLoss({
    amountIn: 50_000,
    reserveIn: 100_000,
    reserveOut: 5_000_000,
    userSlippageBps: 100,
    attackerCapitalUsd: 5000,
  });
  console.log(`   User expected: ${sw.userExpectedOut.toFixed(2)} tokens`);
  console.log(`   User gets:     ${sw.victimActualOut.toFixed(2)} tokens`);
  console.log(`   User loss:     ${sw.userLoss.toFixed(2)} tokens (${sw.userLossPct.toFixed(2)}%)`);
  console.log(`   Risk level:    ${sw.riskLevel.toUpperCase()}`);
  console.log(`   Recommendation: ${sw.recommendation.message}`);
  console.log();

  console.log('2. Jito tip recommendation (MEV-protected, high-congestion, $50k trade):');
  const tip = estimateOptimalTip({
    txValueUsd: 50_000,
    mempoolCongestion: 'high',
    isMevProtected: true,
    isTimeSensitive: true,
  });
  console.log(`   Tip: ${tip.lamports.toLocaleString()} lamports ($${tip.tipUsd.toFixed(4)})`);
  console.log(`   Rationale: ${tip.rationale}`);
  console.log();

  console.log('3. Sandwich simulation across attacker sizes:');
  const scenarios = simulateSandwich({
    amountIn: 50_000,
    reserveIn: 100_000,
    reserveOut: 5_000_000,
  });
  console.log('   AttackerCap | VictimLoss | AttackerProfit | ROI');
  console.log('   ------------|------------|----------------|--------');
  for (const s of scenarios) {
    console.log(`   ${String(s.attackerCapital).padStart(10)} | ${String(s.victimLoss.toFixed(2)).padStart(10)} | ${String(s.attackerProfit.toFixed(2)).padStart(14)} | ${s.attackerRoi}%`);
  }
  console.log();
  console.log('=== Demo complete ===');
}

main();