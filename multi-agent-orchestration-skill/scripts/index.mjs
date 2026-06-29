#!/usr/bin/env node
/**
 * Multi-agent orchestration CLI for Solana workflows.
 *
 * Run a task across multiple agents and aggregate results.
 */
import { TaskQueue } from './task_queue.mjs';
import { ConsensusEngine, STRATEGIES } from './consensus.mjs';
import { RevenueSplitter, STRATEGIES as SPLIT_STRATEGIES } from './revenue_split.mjs';

const HELP = `
solana-multi-agent — Orchestrate multiple agents on Solana workflows

Usage:
  solana-multi-agent task <capability> <payload-json>     Enqueue a task
  solana-multi-agent status                                Show queue status
  solana-multi-agent demo                                  Run a demo orchestration
  solana-multi-agent consensus <strategy> <results-json>   Resolve consensus
  solana-multi-agent split <strategy> <total> <agents>     Split revenue

Strategies:
  consensus: majority | unanimous | weighted | first-valid
  split:     equal | contribution | stake | reputation

Examples:
  solana-multi-agent task swap '{"from":"USDC","to":"SOL","amount":100}'
  solana-multi-agent status
  solana-multi-agent consensus majority '[{"agentId":"a","result":"BUY"},{"agentId":"b","result":"BUY"},{"agentId":"c","result":"SELL"}]'
`;

function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (!cmd || cmd === '--help' || cmd === '-h') {
    console.log(HELP);
    return;
  }

  if (cmd === 'demo') {
    runDemo();
    return;
  }

  if (cmd === 'status') {
    const q = new TaskQueue();
    console.log('Empty queue. Use `task` to enqueue work.');
    return;
  }

  if (cmd === 'consensus') {
    const [strategy, resultsJson] = args;
    if (!strategy || !resultsJson) {
      console.log('Need: consensus <strategy> <results-json>');
      return;
    }
    const votes = JSON.parse(resultsJson);
    const engine = new ConsensusEngine(strategy);
    console.log(JSON.stringify(engine.resolve(votes), null, 2));
    return;
  }

  if (cmd === 'split') {
    const [strategy, totalStr, agentsJson] = args;
    if (!strategy || !totalStr || !agentsJson) {
      console.log('Need: split <strategy> <total> <agents-json>');
      return;
    }
    const agents = JSON.parse(agentsJson);
    const splitter = new RevenueSplitter(strategy);
    const payouts = splitter.split(parseInt(totalStr), agents);
    console.log(JSON.stringify(payouts, null, 2));
    console.log(JSON.stringify(splitter.validate(payouts, parseInt(totalStr)), null, 2));
    return;
  }

  console.log(`Unknown command: ${cmd}\n${HELP}`);
}

function runDemo() {
  console.log('=== Multi-agent orchestration demo ===\n');

  // Set up 3 agents with different specialties
  const q = new TaskQueue();
  q.registerAgent('trader-bot', ['swap', 'analyze-market']);
  q.registerAgent('audit-bot', ['audit', 'verify']);
  q.registerAgent('scout-bot', ['scan', 'monitor']);

  console.log('1. Registered 3 agents with specialties');
  console.log(JSON.stringify(q.status(), null, 2));
  console.log();

  // Queue a bunch of tasks
  q.enqueue({ id: 't1', requiredCapability: 'analyze-market', payload: { token: 'SOL' }, priority: 10 });
  q.enqueue({ id: 't2', requiredCapability: 'audit', payload: { contract: 'Tokenk...Q5' }, priority: 5 });
  q.enqueue({ id: 't3', requiredCapability: 'scan', payload: { query: 'top-volume' }, priority: 3 });
  q.enqueue({ id: 't4', requiredCapability: 'swap', payload: { from: 'USDC', to: 'SOL', amount: 100 }, priority: 7 });
  q.enqueue({ id: 't5', requiredCapability: 'verify', payload: { tx: 'mock-sig' }, priority: 4 });

  console.log('2. Queued 5 tasks with different priorities');
  console.log(JSON.stringify(q.status(), null, 2));
  console.log();

  // Agents claim and complete tasks
  console.log('3. Agents claim and complete work:\n');
  for (let i = 0; i < 5; i++) {
    for (const agentId of ['trader-bot', 'audit-bot', 'scout-bot']) {
      const task = q.claimNext(agentId);
      if (task) {
        console.log(`  [${agentId}] claimed ${task.id} (${task.requiredCapability})`);
        q.complete(task.id, agentId, { result: 'ok', taskId: task.id });
      }
    }
  }
  console.log();
  console.log('4. Final status:');
  console.log(JSON.stringify(q.status(), null, 2));
  console.log();

  // Consensus demo
  console.log('5. Consensus resolution (3 trading agents):');
  const engine = new ConsensusEngine(STRATEGIES.MAJORITY);
  const votes = [
    { agentId: 'trader-a', result: { action: 'BUY', token: 'SOL' }, weight: 1.5 },
    { agentId: 'trader-b', result: { action: 'BUY', token: 'SOL' }, weight: 1.0 },
    { agentId: 'trader-c', result: { action: 'SELL', token: 'SOL' }, weight: 1.0 },
  ];
  const consensus = engine.resolve(votes);
  console.log(`  Result: ${consensus.answer?.action} ${consensus.answer?.token} (confidence: ${(consensus.confidence * 100).toFixed(0)}%)`);
  console.log();

  // Revenue split demo
  console.log('6. Revenue split (1000 USDG, contribution-weighted):');
  const splitter = new RevenueSplitter(SPLIT_STRATEGIES.CONTRIBUTION);
  const payouts = splitter.split(1000, [
    { agentId: 'trader-bot', contribution: 60 },
    { agentId: 'audit-bot', contribution: 30 },
    { agentId: 'scout-bot', contribution: 10 },
  ]);
  for (const p of payouts) {
    console.log(`  ${p.agentId}: ${p.amount} USDG (${(p.share * 100).toFixed(0)}%)`);
  }
  console.log();
  console.log('=== Demo complete ===');
}

main();