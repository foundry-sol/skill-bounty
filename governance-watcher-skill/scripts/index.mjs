#!/usr/bin/env node
/**
 * Governance watcher CLI for Solana agents.
 *
 * Usage:
 *   solana-governance realms
 *   solana-governance proposals <realm-id>
 *   solana-governance watch <realm-id> [--rules rules.json]
 *   solana-governance demo
 */

import { fetchAllRealms, fetchProposals, normalizeProposal, voteBreakdown, timeRemaining, evaluateAlerts } from './proposal_tracker.mjs';
import { simulateVoteOutcome } from './vote_simulator.mjs';
import { AlertEngine } from './alert_engine.mjs';

const HELP = `
solana-governance — Solana DAO governance watcher

Commands:
  realms       List known DAOs (Realms)
  proposals    List proposals for a realm
  watch        Watch a realm with alert rules
  simulate     Simulate vote outcome
  demo         Run a complete demo

Examples:
  solana-governance realms
  solana-governance proposals MNGO
  solana-governance watch MNGO
`;

function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (!cmd || cmd === '--help' || cmd === '-h') {
    console.log(HELP);
    return;
  }
  if (cmd === 'demo') return runDemo();
  if (cmd === 'realms') return runRealms();
  if (cmd === 'proposals') return runProposals(args);
  if (cmd === 'watch') return runWatch(args);
  if (cmd === 'simulate') return runSimulate(args);
  console.log(`Unknown command: ${cmd}`);
}

async function runRealms() {
  const realms = await fetchAllRealms();
  console.log(`Found ${realms.length} realms`);
  for (const r of realms.slice(0, 10)) {
    console.log(`  ${r.symbol || r.name} (${r.pubkey?.slice(0, 8)}...)`);
  }
}

async function runProposals(args) {
  const realmId = args[0];
  if (!realmId) {
    console.log('Need a realm ID');
    return;
  }
  const proposals = await fetchProposals(realmId);
  const normalized = proposals.map(normalizeProposal);
  console.log(`Found ${normalized.length} proposals for ${realmId}:`);
  for (const p of normalized) {
    const remaining = timeRemaining(p);
    const remStr = remaining
      ? remaining.ended ? 'ended' : `${remaining.daysRemaining}d left`
      : 'no deadline';
    console.log(`  ${p.name.slice(0, 60)} | state=${p.state} | ${remStr}`);
  }
}

async function runWatch(args) {
  const realmId = args[0];
  if (!realmId) {
    console.log('Need a realm ID');
    return;
  }
  const rules = {
    states: ['Voting', 'Succeeded', 'Executed'],
    deadlineHours: 48,
    quorumThreshold: 0.5,
    voteSwingThreshold: 0.6,
  };
  const proposals = await fetchProposals(realmId);
  const normalized = proposals.map(normalizeProposal);
  const engine = new AlertEngine();
  const pairs = normalized.map(p => ({ proposal: p, alerts: evaluateAlerts(p, rules) }));
  const newAlerts = engine.processAlerts(pairs);
  console.log(`Generated ${newAlerts.length} new alerts:`);
  for (const a of newAlerts) {
    console.log(`  [${a.severity}] ${a.message}`);
  }
}

function runSimulate(args) {
  // Simulate: yes=350, no=100, maxVoteWeight=1000, 24h left
  const result = simulateVoteOutcome({
    yesVotes: parseInt(args[0] || 350),
    noVotes: parseInt(args[1] || 100),
    maxVoteWeight: parseInt(args[2] || 1000),
    remainingSeconds: parseInt(args[3] || 86400),
    estimatedAdditionalVoters: parseInt(args[4] || 100),
    avgAdditionalVoterWeight: parseFloat(args[5] || 5),
  });
  console.log(JSON.stringify(result, null, 2));
}

async function runDemo() {
  console.log('=== Governance Watcher Demo ===\n');

  console.log('1. Fetching realms...');
  const realms = await fetchAllRealms();
  console.log(`   Found ${realms.length} realms\n`);

  console.log('2. Simulating vote outcome...');
  const sim = simulateVoteOutcome({
    yesVotes: 350, noVotes: 100, maxVoteWeight: 1000,
    remainingSeconds: 86400, estimatedAdditionalVoters: 100, avgAdditionalVoterWeight: 5,
  });
  console.log(`   Current participation: ${(sim.currentParticipation * 100).toFixed(1)}%`);
  console.log(`   Estimated final YES: ${(sim.estimatedFinalYesShare * 100).toFixed(1)}%`);
  console.log(`   Quorum met: ${sim.quorumMet}, Passes: ${sim.passes}`);
  console.log(`   Recommendation: ${sim.recommendation}\n`);

  console.log('3. Normalizing proposal example...');
  const exampleProposal = {
    pubkey: 'prop-123',
    realmId: 'MNGO',
    name: 'Mango Treasury Rebalance',
    state: 'Voting',
    yesVotes: 450,
    noVotes: 200,
    abstainVotes: 50,
    maxVoteWeight: 1000,
    startVoteTs: Math.floor(Date.now() / 1000) - 86400,
    endVoteTs: Math.floor(Date.now() / 1000) + 86400,
  };
  const normalized = normalizeProposal(exampleProposal);
  const breakdown = voteBreakdown(normalized);
  const remaining = timeRemaining(normalized);
  console.log(`   ${normalized.name}: ${breakdown.yesPct.toFixed(1)}% YES, ${breakdown.noPct.toFixed(1)}% NO`);
  console.log(`   Quorum: ${breakdown.quorumMet ? 'met' : 'NOT met'}`);
  console.log(`   Time remaining: ${remaining.hoursRemaining}h\n`);

  console.log('4. Alert evaluation...');
  const rules = {
    states: ['Voting', 'Succeeded'],
    deadlineHours: 48,
    quorumThreshold: 0.5,
    voteSwingThreshold: 0.6,
  };
  const alerts = evaluateAlerts(normalized, rules);
  for (const a of alerts) {
    console.log(`   [${a.severity}] ${a.type}: ${a.message}`);
  }
  console.log();
  console.log('=== Demo complete ===');
}

main();