// tests/orchestration.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TaskQueue } from '../scripts/task_queue.mjs';
import { ConsensusEngine, STRATEGIES } from '../scripts/consensus.mjs';
import { RevenueSplitter, STRATEGIES as SPLIT_STRATEGIES } from '../scripts/revenue_split.mjs';

// ============================================================
// TaskQueue
// ============================================================

test('TaskQueue: register agents and enqueue tasks', () => {
  const q = new TaskQueue();
  q.registerAgent('a', ['swap']);
  q.registerAgent('b', ['audit']);
  assert.equal(q.agents.size, 2);
  const tid = q.enqueue({ requiredCapability: 'swap' });
  assert.equal(q.tasks.size, 1);
  assert.ok(tid);
});

test('TaskQueue: cannot register same agent twice', () => {
  const q = new TaskQueue();
  q.registerAgent('a', ['swap']);
  assert.throws(() => q.registerAgent('a', ['audit']));
});

test('TaskQueue: claim respects capability matching', () => {
  const q = new TaskQueue();
  q.registerAgent('trader', ['swap']);
  q.registerAgent('auditor', ['audit']);
  q.enqueue({ id: 't1', requiredCapability: 'audit' });
  const task = q.claimNext('trader');
  assert.equal(task, null, 'trader should not get audit task');
  const task2 = q.claimNext('auditor');
  assert.equal(task2.id, 't1');
});

test('TaskQueue: priority orders claimNext', () => {
  const q = new TaskQueue();
  q.registerAgent('a', ['work']);
  q.enqueue({ id: 'low', requiredCapability: 'work', priority: 1 });
  q.enqueue({ id: 'high', requiredCapability: 'work', priority: 10 });
  const task = q.claimNext('a');
  assert.equal(task.id, 'high');
});

test('TaskQueue: claimNext load-balances among multiple capable agents', () => {
  const q = new TaskQueue();
  q.registerAgent('a', ['work']);
  q.registerAgent('b', ['work']);
  q.enqueue({ id: 't1', requiredCapability: 'work' });
  // 'a' has 0 tasks done, 'b' has 0 tasks done
  // Either could be assigned, but it's deterministic by iteration order
  const task = q.claimNext('a');
  // The first agent with 0 load should win
  assert.equal(task.assignee, 'a');
});

test('TaskQueue: complete and fail update status', () => {
  const q = new TaskQueue();
  q.registerAgent('a', ['work']);
  q.enqueue({ id: 't1', requiredCapability: 'work' });
  const task = q.claimNext('a');
  q.complete('t1', 'a', { result: 'ok' });
  assert.equal(q.status().tasks.completed, 1);
  assert.equal(q.agents.get('a').status, 'idle');
  assert.equal(q.agents.get('a').tasksCompleted, 1);
});

test('TaskQueue: cannot complete task not assigned to caller', () => {
  const q = new TaskQueue();
  q.registerAgent('a', ['work']);
  q.registerAgent('b', ['work']);
  q.enqueue({ id: 't1', requiredCapability: 'work' });
  q.claimNext('a');
  assert.throws(() => q.complete('t1', 'b', {}));
});

test('TaskQueue: status() reports correct counts', () => {
  const q = new TaskQueue();
  q.registerAgent('a', ['work']);
  q.enqueue({ id: 't1', requiredCapability: 'work' });
  q.enqueue({ id: 't2', requiredCapability: 'work' });
  const s = q.status();
  assert.equal(s.tasks.total, 2);
  assert.equal(s.tasks.pending, 2);
  q.claimNext('a');
  assert.equal(q.status().tasks.inProgress, 1);
});

// ============================================================
// ConsensusEngine
// ============================================================

test('Consensus: majority finds 2/3 winner', () => {
  const e = new ConsensusEngine(STRATEGIES.MAJORITY);
  const r = e.resolve([
    { agentId: 'a', result: 'BUY' },
    { agentId: 'b', result: 'BUY' },
    { agentId: 'c', result: 'SELL' },
  ]);
  assert.equal(r.answer, 'BUY');
  assert.equal(r.dissents.length, 1);
  assert.ok(r.confidence > 0.6);
});

test('Consensus: majority returns null when no supermajority', () => {
  const e = new ConsensusEngine(STRATEGIES.MAJORITY);
  const r = e.resolve([
    { agentId: 'a', result: 'BUY' },
    { agentId: 'b', result: 'SELL' },
  ]);
  assert.equal(r.answer, null);
});

test('Consensus: unanimous requires all agree', () => {
  const e = new ConsensusEngine(STRATEGIES.UNANIMOUS);
  const agree = e.resolve([
    { agentId: 'a', result: 'X' },
    { agentId: 'b', result: 'X' },
    { agentId: 'c', result: 'X' },
  ]);
  assert.equal(agree.answer, 'X');
  const disagree = e.resolve([
    { agentId: 'a', result: 'X' },
    { agentId: 'b', result: 'Y' },
  ]);
  assert.equal(disagree.answer, null);
});

test('Consensus: weighted gives more trust to high-weight agents', () => {
  const e = new ConsensusEngine(STRATEGIES.WEIGHTED);
  const r = e.resolve([
    { agentId: 'a', result: 'BUY', weight: 10 },
    { agentId: 'b', result: 'SELL', weight: 1 },
  ]);
  assert.equal(r.answer, 'BUY');
  assert.equal(r.confidence, 10/11);
});

test('Consensus: first-valid takes first non-error', () => {
  const e = new ConsensusEngine(STRATEGIES.FIRST_VALID);
  const r = e.resolve([
    { agentId: 'a', result: 'FIRST' },
    { agentId: 'b', result: 'SECOND' },
  ]);
  assert.equal(r.answer, 'FIRST');
});

test('Consensus: handles complex object results', () => {
  const e = new ConsensusEngine(STRATEGIES.MAJORITY);
  const r = e.resolve([
    { agentId: 'a', result: { action: 'BUY', amount: 100 } },
    { agentId: 'b', result: { action: 'BUY', amount: 100 } },
    { agentId: 'c', result: { action: 'SELL', amount: 100 } },
  ]);
  assert.deepEqual(r.answer, { action: 'BUY', amount: 100 });
});

test('Consensus: error votes are filtered out', () => {
  const e = new ConsensusEngine(STRATEGIES.MAJORITY);
  const r = e.resolve([
    { agentId: 'a', result: 'X' },
    { agentId: 'b', result: { error: 'crashed' } },
    { agentId: 'c', result: 'X' },
  ]);
  assert.equal(r.answer, 'X');
});

// ============================================================
// RevenueSplitter
// ============================================================

test('RevenueSplitter: equal split divides evenly', () => {
  const s = new RevenueSplitter(SPLIT_STRATEGIES.EQUAL);
  const r = s.split(100, [
    { agentId: 'a' }, { agentId: 'b' }, { agentId: 'c' },
  ]);
  assert.equal(r[0].amount, 33);
  assert.equal(r[1].amount, 33);
  assert.equal(r[2].amount, 33);
});

test('RevenueSplitter: contribution-weighted', () => {
  const s = new RevenueSplitter(SPLIT_STRATEGIES.CONTRIBUTION);
  const r = s.split(100, [
    { agentId: 'a', contribution: 70 },
    { agentId: 'b', contribution: 30 },
  ]);
  assert.equal(r[0].amount, 70);
  assert.equal(r[1].amount, 30);
});

test('RevenueSplitter: stake-weighted', () => {
  const s = new RevenueSplitter(SPLIT_STRATEGIES.STAKE);
  const r = s.split(1000, [
    { agentId: 'a', stake: 750 },
    { agentId: 'b', stake: 250 },
  ]);
  assert.equal(r[0].amount, 750);
  assert.equal(r[1].amount, 250);
});

test('RevenueSplitter: reputation-weighted (default 1)', () => {
  const s = new RevenueSplitter(SPLIT_STRATEGIES.REPUTATION);
  const r = s.split(100, [
    { agentId: 'newbie', reputation: 0.5 },
    { agentId: 'veteran', reputation: 1.5 },
  ]);
  assert.equal(r[0].amount, 25);
  assert.equal(r[1].amount, 75);
});

test('RevenueSplitter: validates sum ≤ total', () => {
  const s = new RevenueSplitter(SPLIT_STRATEGIES.EQUAL);
  const r = s.split(100, [
    { agentId: 'a' }, { agentId: 'b' }, { agentId: 'c' },
  ]);
  const v = s.validate(r, 100);
  assert.ok(v.ok);
  assert.equal(v.remainder, 1); // 33*3 = 99, remainder 1
});

test('RevenueSplitter: zero-contribution agents get nothing', () => {
  const s = new RevenueSplitter(SPLIT_STRATEGIES.CONTRIBUTION);
  const r = s.split(100, [
    { agentId: 'a', contribution: 0 },
    { agentId: 'b', contribution: 100 },
  ]);
  // 'a' has 0 contribution, should get 0
  const aPayout = r.find(p => p.agentId === 'a');
  assert.equal(aPayout.amount, 0);
  const bPayout = r.find(p => p.agentId === 'b');
  assert.equal(bPayout.amount, 100);
});