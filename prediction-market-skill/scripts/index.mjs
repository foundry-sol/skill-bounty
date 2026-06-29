#!/usr/bin/env node
/**
 * Prediction market CLI for Solana agents.
 *
 * Usage:
 *   solana-prediction markets [--source polymarket|drift|kalshi|all] [--limit 50]
 *   solana-prediction analyze --belief 0.65 --market 0.50 --confidence 0.7 --bankroll 1000
 *   solana-prediction positions [open|close|show] ...
 *   solana-prediction demo
 */

import { fetchPolymarketMarkets, fetchDriftMarkets, fetchKalshiMarkets, fetchAllMarkets } from './prediction_data.mjs';
import { calculateEdge, portfolioEdge } from './edge_calculator.mjs';
import { PositionTracker } from './position_tracker.mjs';

const HELP = `
solana-prediction — Prediction market toolkit for Solana agents

Commands:
  markets    Fetch markets from one or all sources
  analyze    Calculate edge and position size for a trade
  positions  Manage open positions (open/close/show)
  demo       Run all demos

Examples:
  solana-prediction markets --source all
  solana-prediction markets --source polymarket --limit 100
  solana-prediction analyze --belief 0.65 --market 0.50 --confidence 0.7 --bankroll 1000
  solana-prediction positions open --id p1 --platform polymarket --side YES --size 100 --entry 0.45
  solana-prediction positions show
`;

function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (!cmd || cmd === '--help' || cmd === '-h') {
    console.log(HELP);
    return;
  }

  const opts = parseArgs(args);

  if (cmd === 'demo') {
    return runDemo();
  }

  if (cmd === 'markets') {
    return runMarkets(opts);
  }

  if (cmd === 'analyze') {
    return runAnalyze(opts);
  }

  if (cmd === 'positions') {
    return runPositions(opts);
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
        opts[key] = true;
      }
    }
  }
  return opts;
}

async function runMarkets(opts) {
  const source = opts.source || 'all';
  const limit = parseInt(opts.limit || 50);
  let markets = [];
  if (source === 'polymarket' || source === 'all') {
    markets.push(...await fetchPolymarketMarkets({ limit }));
  }
  if (source === 'drift' || source === 'all') {
    markets.push(...await fetchDriftMarkets());
  }
  if (source === 'kalshi' || source === 'all') {
    markets.push(...await fetchKalshiMarkets({ limit }));
  }
  console.log(`Found ${markets.length} markets from ${source}:`);
  for (const m of markets.slice(0, 20)) {
    const yes = m.yesPrice > 0 ? `YES ${(m.yesPrice * 100).toFixed(0)}¢` : 'perpetual';
    console.log(`  [${m.source.padEnd(10)}] ${m.question.slice(0, 70).padEnd(70)} | ${yes.padEnd(12)} | Vol $${m.volume.toFixed(0)}`);
  }
}

function runAnalyze(opts) {
  const result = calculateEdge({
    belief: parseFloat(opts.belief),
    marketPrice: parseFloat(opts.market),
    confidence: parseFloat(opts.confidence || 0.7),
    bankroll: parseFloat(opts.bankroll || 1000),
  });
  console.log(JSON.stringify(result, null, 2));
}

function runPositions(opts) {
  const tracker = new PositionTracker();
  const sub = opts._[0] || 'show';
  if (sub === 'show') {
    console.log('Open positions:');
    for (const p of tracker.getOpen()) {
      console.log(`  ${p.id} | ${p.platform} | ${p.side} | size ${p.size} | entry ${p.entryPrice}`);
    }
    console.log('\nClosed positions:');
    for (const p of tracker.getClosed()) {
      console.log(`  ${p.id} | ${p.platform} | ${p.side} | P&L $${p.pnl.toFixed(2)} (${p.pnlPct.toFixed(1)}%)`);
    }
  } else if (sub === 'open') {
    const id = tracker.open({
      id: opts.id,
      platform: opts.platform,
      marketId: opts.market,
      side: opts.side,
      size: parseFloat(opts.size),
      entryPrice: parseFloat(opts.entry),
    });
    console.log(`Opened position ${id}`);
  } else if (sub === 'close') {
    const closed = tracker.close(opts.id, parseFloat(opts.exit));
    console.log(`Closed: P&L $${closed.pnl.toFixed(2)} (${closed.pnlPct.toFixed(1)}%)`);
  } else {
    console.log(`Unknown subcommand: ${sub}`);
  }
}

async function runDemo() {
  console.log('=== Prediction Market Demo ===\n');

  console.log('1. Fetching markets from all sources...\n');
  const markets = await fetchAllMarkets();
  console.log(`   Found ${markets.length} markets total\n`);

  console.log('2. Edge analysis example:');
  const edge = calculateEdge({
    belief: 0.65,
    marketPrice: markets[0]?.yesPrice || 0.5,
    confidence: 0.7,
    bankroll: 1000,
  });
  console.log(`   Edge: ${(edge.edge * 100).toFixed(1)}%`);
  console.log(`   Direction: ${edge.edgeDirection}`);
  console.log(`   Kelly fraction: ${(edge.kellyFraction * 100).toFixed(2)}%`);
  console.log(`   Position size: $${edge.positionSize.toFixed(2)}`);
  console.log(`   Recommendation: ${edge.recommendation}\n`);

  console.log('3. Position tracking example:');
  const tracker = new PositionTracker('/tmp/prediction-demo-positions.json');
  try {
    tracker.open({
      id: 'demo-1',
      platform: 'polymarket',
      marketId: 'demo-market',
      side: 'YES',
      size: 100,
      entryPrice: 0.45,
    });
    tracker.open({
      id: 'demo-2',
      platform: 'drift',
      marketId: 'demo-2',
      side: 'NO',
      size: 50,
      entryPrice: 0.60,
    });
    console.log('   Opened 2 positions');
    const closed = tracker.close('demo-1', 0.55);
    console.log(`   Closed demo-1: P&L $${closed.pnl.toFixed(2)} (${closed.pnlPct.toFixed(1)}%)`);
    console.log('   Still open:', tracker.getOpen().map(p => p.id).join(', '));
  } catch (err) {
    console.log('   (Skipping live demo:', err.message, ')');
  }
  console.log();
  console.log('=== Demo complete ===');
}

main();