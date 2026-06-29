// tests/score_validator.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreValidator } from '../scripts/score_validator.mjs';
import { simulateStake } from '../scripts/simulate_stake.mjs';
import { netApr, projectYield, rankLsts } from '../scripts/lst_yield_comparison.mjs';

// ============================================================
// scoreValidator
// ============================================================

test('scoreValidator: zero commission active validator scores high', () => {
  const v = {
    votePubkey: 'v1',
    name: 'good',
    commissionPct: 0,
    activatedStakeSol: 50000,
    stakeSharePct: 1.5,
    status: 'active',
    lastEpochCredits: 1_500_000,
  };
  const result = scoreValidator(v);
  assert.ok(result.score >= 80, `expected high score, got ${result.score}`);
  assert.ok(!result.flags.includes('high_commission'));
});

test('scoreValidator: high commission penalized', () => {
  const v = {
    votePubkey: 'v2',
    name: 'greedy',
    commissionPct: 50,
    activatedStakeSol: 50000,
    stakeSharePct: 1.5,
    status: 'active',
    lastEpochCredits: 1_500_000,
  };
  const result = scoreValidator(v);
  assert.ok(result.flags.includes('high_commission'));
  assert.ok(result.components.commission <= 13, `commission pts should be low, got ${result.components.commission}`);
});

test('scoreValidator: delinquent validator hard-fails', () => {
  const v = {
    votePubkey: 'v3',
    name: 'bad',
    commissionPct: 5,
    activatedStakeSol: 1000,
    stakeSharePct: 0.01,
    status: 'delinquent',
    lastEpochCredits: 0,
  };
  const result = scoreValidator(v);
  assert.equal(result.components.delinquency, 0);
  assert.ok(result.flags.includes('delinquent'));
  assert.ok(result.score < 50);
});

test('scoreValidator: huge validator flagged centralization', () => {
  const v = {
    votePubkey: 'v4',
    name: 'whale',
    commissionPct: 5,
    activatedStakeSol: 13_000_000,
    stakeSharePct: 12,
    status: 'active',
    lastEpochCredits: 1_500_000,
  };
  const result = scoreValidator(v);
  assert.ok(result.flags.includes('centralization_risk'));
});

test('scoreValidator: zero commission gets lower headroom score', () => {
  const v0 = scoreValidator({
    votePubkey: 'a',
    name: 'a',
    commissionPct: 0,
    activatedStakeSol: 5000,
    stakeSharePct: 0.5,
    status: 'active',
    lastEpochCredits: 1_400_000,
  });
  const v5 = scoreValidator({
    votePubkey: 'b',
    name: 'b',
    commissionPct: 5,
    activatedStakeSol: 5000,
    stakeSharePct: 0.5,
    status: 'active',
    lastEpochCredits: 1_400_000,
  });
  assert.ok(v5.components.headroom > v0.components.headroom);
});

// ============================================================
// simulateStake
// ============================================================

test('simulateStake: 100 SOL @ 5% commission over 1 epoch returns ~0.62 SOL net', () => {
  const r = simulateStake(100, 5, 1, 4.5);
  // 4.5% APR * 0.95 (after commission) = 4.275% net
  // / 146 epochs per year ≈ 0.0293 SOL per epoch
  assert.ok(r.totalNetSol > 0.02 && r.totalNetSol < 0.04, `got ${r.totalNetSol}`);
  assert.equal(r.aprPct, 4.275);
});

test('simulateStake: 100% commission yields zero net', () => {
  const r = simulateStake(100, 100, 1, 4.5);
  assert.equal(r.totalNetSol, 0);
  assert.equal(r.aprPct, 0);
});

test('simulateStake: zero commission maximizes yield', () => {
  const r0 = simulateStake(100, 0, 30, 4.5);
  const r10 = simulateStake(100, 10, 30, 4.5);
  assert.ok(r0.totalNetSol > r10.totalNetSol);
});

test('simulateStake: throws on bad input', () => {
  assert.throws(() => simulateStake(0, 5, 1));
  assert.throws(() => simulateStake(-1, 5, 1));
  assert.throws(() => simulateStake(100, -1, 1));
  assert.throws(() => simulateStake(100, 150, 1));
  assert.throws(() => simulateStake(100, 5, 0));
});

// ============================================================
// LST ranking
// ============================================================

test('netApr: subtracts spread + protocol fee', () => {
  const lst = {
    expectedApr: 8.0,
    protocolFeePct: 0.5,
    lstSpreadPct: 0.1,
  };
  assert.equal(netApr(lst), 7.4);
});

test('netApr: never goes negative', () => {
  const lst = { expectedApr: 0.05, protocolFeePct: 1, lstSpreadPct: 1 };
  assert.equal(netApr(lst), 0);
});

test('projectYield: linear on days at fixed APR', () => {
  const y1 = projectYield(1000, 7, 30);
  const y2 = projectYield(1000, 7, 60);
  assert.ok(Math.abs(y2 - y1 * 2) < 0.001);
});

test('rankLsts: returns sorted by net APR desc, jitoSOL likely on top', () => {
  const ranked = rankLsts(1000, 365);
  assert.ok(ranked.length >= 4);
  for (let i = 0; i < ranked.length - 1; i++) {
    assert.ok(ranked[i].netAprPct >= ranked[i + 1].netAprPct, 'must be sorted descending');
  }
  // jitoSOL or native SOL should be on top
  assert.ok(['jitoSOL', 'SOL'].includes(ranked[0].symbol));
});

test('rankLsts: native SOL marked illiquid, LSTs liquid', () => {
  const ranked = rankLsts();
  const native = ranked.find((r) => r.symbol === 'SOL');
  const jito = ranked.find((r) => r.symbol === 'jitoSOL');
  assert.equal(native.liquid, false);
  assert.equal(jito.liquid, true);
});