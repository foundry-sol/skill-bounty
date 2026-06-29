// tests/mev.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateSandwichLoss, calculatePriceImpact } from '../scripts/sandwich_detector.mjs';
import { estimateOptimalTip } from '../scripts/jito_tip_estimator.mjs';
import { simulateSandwich } from '../scripts/sandwich_simulator.mjs';

// ============================================================
// calculatePriceImpact
// ============================================================

test('calculatePriceImpact: basic swap', () => {
  const r = calculatePriceImpact(100, 1000, 10_000);
  assert.ok(r.amountOut > 0);
  assert.ok(r.amountOut < 1000);
  assert.ok(r.priceImpact > 0);
  assert.ok(r.priceImpact < 1);
});

test('calculatePriceImpact: 50/50 ratio gives 100x', () => {
  // 1 unit in with 1:1 reserves gives ~1 unit out (minus fees)
  const r = calculatePriceImpact(1, 100, 100);
  assert.ok(r.amountOut > 0.9 && r.amountOut < 1.0);
});

test('calculatePriceImpact: large trade has more impact than small', () => {
  const small = calculatePriceImpact(10, 1000, 10_000);
  const large = calculatePriceImpact(500, 1000, 10_000);
  assert.ok(large.priceImpact > small.priceImpact);
});

test('calculatePriceImpact: rejects invalid input', () => {
  assert.throws(() => calculatePriceImpact(0, 1000, 10_000));
  assert.throws(() => calculatePriceImpact(100, 0, 10_000));
  assert.throws(() => calculatePriceImpact(100, 1000, 0));
  assert.throws(() => calculatePriceImpact(-1, 1000, 10_000));
});

// ============================================================
// estimateSandwichLoss
// ============================================================

test('estimateSandwichLoss: returns expected fields', () => {
  const r = estimateSandwichLoss({
    amountIn: 1000,
    reserveIn: 10000,
    reserveOut: 100000,
    userSlippageBps: 100,
  });
  assert.ok('userExpectedOut' in r);
  assert.ok('victimActualOut' in r);
  assert.ok('userLoss' in r);
  assert.ok('attackerProfit' in r);
  assert.ok('riskLevel' in r);
  assert.ok('recommendation' in r);
});

test('estimateSandwichLoss: victim loses more with bigger attacker', () => {
  const small = estimateSandwichLoss({
    amountIn: 1000,
    reserveIn: 10000,
    reserveOut: 100000,
    attackerCapitalUsd: 100,
  });
  const big = estimateSandwichLoss({
    amountIn: 1000,
    reserveIn: 10000,
    reserveOut: 100000,
    attackerCapitalUsd: 10000,
  });
  assert.ok(big.userLoss > small.userLoss);
});

test('estimateSandwichLoss: thin pool = higher risk', () => {
  const thinPool = estimateSandwichLoss({
    amountIn: 1000,
    reserveIn: 1000,  // very thin
    reserveOut: 10000,
    userSlippageBps: 100,
  });
  const deepPool = estimateSandwichLoss({
    amountIn: 1000,
    reserveIn: 1_000_000,  // deep
    reserveOut: 10_000_000,
    userSlippageBps: 100,
  });
  assert.ok(thinPool.userLossPct > deepPool.userLossPct);
});

test('estimateSandwichLoss: high risk recommends block', () => {
  const r = estimateSandwichLoss({
    amountIn: 50_000,
    reserveIn: 100_000,
    reserveOut: 5_000_000,
    userSlippageBps: 100,
    attackerCapitalUsd: 5000,
  });
  assert.equal(r.riskLevel, 'high');
  assert.equal(r.recommendation.action, 'block');
});

test('estimateSandwichLoss: low risk recommends proceed', () => {
  const r = estimateSandwichLoss({
    amountIn: 100,
    reserveIn: 10_000_000,
    reserveOut: 100_000_000,
    userSlippageBps: 50,
    attackerCapitalUsd: 1000,
  });
  assert.equal(r.riskLevel, 'low');
  assert.equal(r.recommendation.action, 'proceed');
});

// ============================================================
// estimateOptimalTip
// ============================================================

test('estimateOptimalTip: low congestion = low tip', () => {
  const r = estimateOptimalTip({ txValueUsd: 100, mempoolCongestion: 'low' });
  assert.ok(r.lamports <= 10_000);
});

test('estimateOptimalTip: extreme congestion = high tip', () => {
  const r = estimateOptimalTip({ txValueUsd: 100, mempoolCongestion: 'extreme' });
  assert.ok(r.lamports >= 100_000);
});

test('estimateOptimalTip: high value bumps tier up', () => {
  const small = estimateOptimalTip({ txValueUsd: 100, mempoolCongestion: 'normal' });
  const big = estimateOptimalTip({ txValueUsd: 1_000_000, mempoolCongestion: 'normal' });
  assert.ok(big.lamports > small.lamports);
});

test('estimateOptimalTip: caps at 0.1% of tx value', () => {
  // $10 tx with extreme congestion should still cap at 0.1% of $10 = $0.01 ≈ 143k lamports
  const r = estimateOptimalTip({ txValueUsd: 10, mempoolCongestion: 'extreme' });
  const maxSensible = (10 * 0.001) * 1e9 / 70; // ~143k lamports
  assert.ok(r.lamports <= maxSensible * 1.1, 'should be capped at 0.1% of value');
  assert.ok(r.cappedByValue);
});

test('estimateOptimalTip: MEV-protected bumps tier', () => {
  const normal = estimateOptimalTip({ txValueUsd: 1000, mempoolCongestion: 'normal' });
  const mev = estimateOptimalTip({ txValueUsd: 1000, mempoolCongestion: 'normal', isMevProtected: true });
  assert.ok(mev.lamports > normal.lamports);
});

test('estimateOptimalTip: time-sensitive bumps tier', () => {
  const normal = estimateOptimalTip({ txValueUsd: 1000, mempoolCongestion: 'normal' });
  const urgent = estimateOptimalTip({ txValueUsd: 1000, mempoolCongestion: 'normal', isTimeSensitive: true });
  assert.ok(urgent.lamports > normal.lamports);
});

// ============================================================
// simulateSandwich
// ============================================================

test('simulateSandwich: returns scenarios for each attacker size', () => {
  const scenarios = simulateSandwich({
    amountIn: 1_000,  // small trade, 1% of pool
    reserveIn: 100_000,
    reserveOut: 5_000_000,
  });
  assert.equal(scenarios.length, 5); // default 5 attacker sizes
  for (const s of scenarios) {
    assert.ok('attackerCapital' in s);
    assert.ok('victimLoss' in s);
    assert.ok('attackerProfit' in s);
  }
});

test('simulateSandwich: larger attacker capital = more victim loss', () => {
  const scenarios = simulateSandwich({
    amountIn: 1_000,
    reserveIn: 100_000,
    reserveOut: 5_000_000,
  });
  // At least the larger attackers should cause more loss than the smallest
  const smallest = scenarios[0].victimLoss;
  const largest = scenarios[scenarios.length - 1].victimLoss;
  assert.ok(largest > smallest, `largest (${largest}) should be > smallest (${smallest})`);
});

test('simulateSandwich: rejects invalid input', () => {
  assert.throws(() => simulateSandwich({ amountIn: 0, reserveIn: 100, reserveOut: 1000 }));
  assert.throws(() => simulateSandwich({ amountIn: 100, reserveIn: 0, reserveOut: 1000 }));
  assert.throws(() => simulateSandwich({ amountIn: 100, reserveIn: 100, reserveOut: 0 }));
});

test('simulateSandwich: optimal attacker size is profitable on thin pool', () => {
  // On a thin pool with a reasonable trade size, an attacker with the right
  // size can extract profit. Use parameters where the math works out.
  const scenarios = simulateSandwich({
    amountIn: 500,  // 0.5% of pool
    reserveIn: 100_000,
    reserveOut: 5_000_000,
  });
  // At least one of the middle-size scenarios should be profitable
  const profitable = scenarios.filter(s => s.attackerProfit > 0);
  assert.ok(profitable.length > 0, 'at least one attacker size should profit');
});