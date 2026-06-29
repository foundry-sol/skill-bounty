// tests/governance.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeProposal, voteBreakdown, timeRemaining, evaluateAlerts } from '../scripts/proposal_tracker.mjs';
import { simulateVoteOutcome } from '../scripts/vote_simulator.mjs';
import { AlertEngine } from '../scripts/alert_engine.mjs';

const EPS = 1e-9;
function assertApprox(actual, expected, eps = EPS, msg) {
  if (Math.abs(actual - expected) > eps) {
    throw new Error(`${msg || ''} expected ${expected} ± ${eps}, got ${actual}`);
  }
}

// ============================================================
// normalizeProposal + voteBreakdown
// ============================================================

test('normalizeProposal: basic structure', () => {
  const raw = {
    pubkey: 'prop1',
    realmId: 'MNGO',
    name: 'Test Proposal',
    state: 'Voting',
    yesVotes: 100,
    noVotes: 50,
    maxVoteWeight: 1000,
  };
  const p = normalizeProposal(raw);
  assert.equal(p.id, 'prop1');
  assert.equal(p.yesVotes, 100);
  assert.equal(p.noVotes, 50);
});

test('normalizeProposal: handles string-encoded numbers', () => {
  const raw = {
    pubkey: 'p',
    yesVotes: '250',
    noVotes: '150',
    maxVoteWeight: '1000',
  };
  const p = normalizeProposal(raw);
  assert.equal(p.yesVotes, 250);
  assert.equal(p.noVotes, 150);
});

test('voteBreakdown: yes > no, quorum met', () => {
  const p = normalizeProposal({
    yesVotes: 600, noVotes: 200, maxVoteWeight: 1000,
  });
  const b = voteBreakdown(p);
  assertApprox(b.yesPct, 75);
  assertApprox(b.noPct, 25);
  assert.equal(b.quorumMet, true);
});

test('voteBreakdown: quorum NOT met', () => {
  const p = normalizeProposal({
    yesVotes: 200, noVotes: 100, maxVoteWeight: 1000,
  });
  const b = voteBreakdown(p);
  assert.equal(b.quorumMet, false);
});

test('voteBreakdown: no votes = no quorum', () => {
  const p = normalizeProposal({
    yesVotes: 0, noVotes: 0, maxVoteWeight: 1000,
  });
  const b = voteBreakdown(p);
  assert.equal(b.total, 0);
  assert.equal(b.quorumMet, false);
  assert.equal(b.passed, null);
});

test('voteBreakdown: passed flag from executed state', () => {
  const p = normalizeProposal({
    state: 'Succeeded',
    yesVotes: 100, noVotes: 50, maxVoteWeight: 1000,
  });
  const b = voteBreakdown(p);
  assert.equal(b.passed, true);
});

// ============================================================
// timeRemaining
// ============================================================

test('timeRemaining: future endVoteTs', () => {
  const now = Math.floor(Date.now() / 1000);
  const p = normalizeProposal({ endVoteTs: now + 86400 });
  const r = timeRemaining(p, now);
  assert.equal(r.ended, false);
  assertApprox(r.hoursRemaining, 24, 0);
});

test('timeRemaining: past endVoteTs', () => {
  const now = Math.floor(Date.now() / 1000);
  const p = normalizeProposal({ endVoteTs: now - 1000 });
  const r = timeRemaining(p, now);
  assert.equal(r.ended, true);
  assert.equal(r.remaining, 0);
});

test('timeRemaining: no endVoteTs', () => {
  const p = normalizeProposal({});
  assert.equal(timeRemaining(p), null);
});

// ============================================================
// evaluateAlerts
// ============================================================

test('evaluateAlerts: state alert', () => {
  const p = normalizeProposal({ state: 'Voting' });
  const alerts = evaluateAlerts(p, { states: ['Voting'] });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].type, 'state');
});

test('evaluateAlerts: deadline alert when <24h', () => {
  const now = Math.floor(Date.now() / 1000);
  const p = normalizeProposal({ endVoteTs: now + 3600 }); // 1h left
  const alerts = evaluateAlerts(p, { deadlineHours: 24 });
  const deadlineAlert = alerts.find(a => a.type === 'deadline');
  assert.ok(deadlineAlert);
  assert.equal(deadlineAlert.severity, 'high');
});

test('evaluateAlerts: no alerts when rules dont match', () => {
  const p = normalizeProposal({ state: 'Draft' });
  const alerts = evaluateAlerts(p, { states: ['Voting'] });
  assert.equal(alerts.length, 0);
});

test('evaluateAlerts: passing alert when yesPct high', () => {
  const p = normalizeProposal({
    yesVotes: 700, noVotes: 100, maxVoteWeight: 1000,
  });
  const alerts = evaluateAlerts(p, { voteSwingThreshold: 0.6 });
  const passingAlert = alerts.find(a => a.type === 'passing');
  assert.ok(passingAlert);
});

// ============================================================
// simulateVoteOutcome
// ============================================================

test('simulateVoteOutcome: clear pass', () => {
  const result = simulateVoteOutcome({
    yesVotes: 600, noVotes: 100, maxVoteWeight: 1000,
    estimatedAdditionalVoters: 0,
  });
  assert.equal(result.passes, true);
  assert.equal(result.recommendation, 'PASSING');
});

test('simulateVoteOutcome: clear fail', () => {
  const result = simulateVoteOutcome({
    yesVotes: 100, noVotes: 600, maxVoteWeight: 1000,
    estimatedAdditionalVoters: 0,
  });
  assert.equal(result.passes, false);
});

test('simulateVoteOutcome: low participation = no quorum', () => {
  const result = simulateVoteOutcome({
    yesVotes: 100, noVotes: 100, maxVoteWeight: 1000,
    estimatedAdditionalVoters: 0,
  });
  assert.equal(result.quorumMet, false);
});

test('simulateVoteOutcome: pessimistic assumption affects estimate', () => {
  const opt = simulateVoteOutcome({
    yesVotes: 300, noVotes: 200, maxVoteWeight: 1000,
    estimatedAdditionalVoters: 100, avgAdditionalVoterWeight: 5,
    pessimisticAssumption: 0, // Optimistic — all new voters vote YES
  });
  const pess = simulateVoteOutcome({
    yesVotes: 300, noVotes: 200, maxVoteWeight: 1000,
    estimatedAdditionalVoters: 100, avgAdditionalVoterWeight: 5,
    pessimisticAssumption: 1, // Pessimistic — all new voters vote NO
  });
  assert.ok(opt.estimatedFinalYes > pess.estimatedFinalYes);
});

// ============================================================
// AlertEngine
// ============================================================

test('AlertEngine: detects new alerts', () => {
  const tmp = path.join('/tmp', `gov-test-${Date.now()}-${Math.random()}.json`);
  const engine = new AlertEngine(tmp);
  engine.clear();
  const proposal = normalizeProposal({ pubkey: 'p1', state: 'Voting' });
  const alerts = evaluateAlerts(proposal, { states: ['Voting'] });
  const newAlerts = engine.processAlerts([{ proposal, alerts }]);
  assert.ok(newAlerts.length > 0);
  fs.rmSync(tmp, { force: true });
});

test('AlertEngine: deduplicates seen alerts', () => {
  const tmp = path.join('/tmp', `gov-test-${Date.now()}-${Math.random()}.json`);
  const engine = new AlertEngine(tmp);
  engine.clear();
  const proposal = normalizeProposal({ pubkey: 'p1', state: 'Voting' });
  const alerts = evaluateAlerts(proposal, { states: ['Voting'] });

  const first = engine.processAlerts([{ proposal, alerts }]);
  const second = engine.processAlerts([{ proposal, alerts }]);
  assert.ok(first.length > 0);
  assert.equal(second.length, 0);
  fs.rmSync(tmp, { force: true });
});

test('AlertEngine: dismiss suppresses future alerts', () => {
  const tmp = path.join('/tmp', `gov-test-${Date.now()}-${Math.random()}.json`);
  const engine = new AlertEngine(tmp);
  engine.clear();
  const proposal = normalizeProposal({ pubkey: 'p1', state: 'Voting' });
  const alerts = evaluateAlerts(proposal, { states: ['Voting'] });
  const first = engine.processAlerts([{ proposal, alerts }]);
  if (first.length > 0) {
    const alertId = engine._makeId(first[0]);
    engine.dismiss(alertId);
    const second = engine.processAlerts([{ proposal, alerts }]);
    const sameAlert = second.find(a => engine._makeId(a) === alertId);
    assert.equal(sameAlert, undefined);
  }
  fs.rmSync(tmp, { force: true });
});

test('AlertEngine: persists across instances', () => {
  const tmp = path.join('/tmp', `gov-test-${Date.now()}-${Math.random()}.json`);
  const e1 = new AlertEngine(tmp);
  e1.clear();
  const proposal = normalizeProposal({ pubkey: 'p1', state: 'Voting' });
  e1.processAlerts([{ proposal, alerts: evaluateAlerts(proposal, { states: ['Voting'] }) }]);

  const e2 = new AlertEngine(tmp);
  // Seen state persists, so second run should be empty
  const second = e2.processAlerts([{ proposal, alerts: evaluateAlerts(proposal, { states: ['Voting'] }) }]);
  assert.equal(second.length, 0);
  fs.rmSync(tmp, { force: true });
});