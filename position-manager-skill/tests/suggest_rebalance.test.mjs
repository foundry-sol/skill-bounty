import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { suggestRebalance } from '../scripts/suggest_rebalance.mjs';

// Wide range so default position is comfortably in_range at price 105.
const basePosition = {
  initial: { price_lower: 90, price_upper: 130, value_usd: 1000 },
  current: { price: 105, value_usd: 1020 },
};

test('suggestRebalance: in-range healthy → hold', () => {
  const r = suggestRebalance(basePosition);
  assert.equal(r.action, 'hold');
  assert.equal(r.confidence, 'high');
  assert.ok(r.reason.toLowerCase().includes('healthy'));
});

test('suggestRebalance: below range → rebalance', () => {
  const p = JSON.parse(JSON.stringify(basePosition));
  p.current.price = 80; // 11% below lower (90)
  const r = suggestRebalance(p);
  assert.equal(r.action, 'rebalance');
  assert.equal(r.confidence, 'medium');
  // proposed range should center on current price
  const center = (r.proposed_range.lower + r.proposed_range.upper) / 2;
  assert.ok(Math.abs(center - 80) < 0.01);
});

test('suggestRebalance: above range → rebalance', () => {
  const p = JSON.parse(JSON.stringify(basePosition));
  p.current.price = 140; // 7.7% above upper (130)
  const r = suggestRebalance(p);
  assert.equal(r.action, 'rebalance');
  const center = (r.proposed_range.lower + r.proposed_range.upper) / 2;
  assert.ok(Math.abs(center - 140) < 0.01);
});

test('suggestRebalance: near lower bound → widen asymmetric', () => {
  const p = JSON.parse(JSON.stringify(basePosition));
  p.current.price = 93; // 3.3% above lower (90)
  const r = suggestRebalance(p);
  assert.equal(r.action, 'widen');
  assert.equal(r.confidence, 'low');
  // Asymmetric widen: lower should expand DOWN
  assert.ok(r.proposed_range.lower < p.initial.price_lower);
});

test('suggestRebalance: near upper bound → widen asymmetric', () => {
  const p = JSON.parse(JSON.stringify(basePosition));
  p.current.price = 125; // 3.85% below upper (130)
  const r = suggestRebalance(p);
  assert.equal(r.action, 'widen');
  // Asymmetric widen: upper should expand UP
  assert.ok(r.proposed_range.upper > p.initial.price_upper);
});

test('suggestRebalance: proposed width makes sense', () => {
  const p = JSON.parse(JSON.stringify(basePosition));
  p.current.price = 80;
  const r = suggestRebalance(p);
  assert.ok(r.proposed_range.width_pct > 0);
  assert.ok(r.proposed_range.lower > 0);
  assert.ok(r.proposed_range.upper > r.proposed_range.lower);
});

test('suggestRebalance: gas cost estimate present', () => {
  const r = suggestRebalance(basePosition);
  assert.ok(typeof r.expected_improvement.gas_cost_usd_estimate === 'number');
  assert.ok(r.expected_improvement.gas_cost_usd_estimate > 0);
});

test('suggestRebalance: missing fields throws', () => {
  assert.throws(() => suggestRebalance({ initial: {}, current: {} }), /Missing required fields/);
});

test('suggestRebalance: warnings populated for heuristic actions', () => {
  const p = JSON.parse(JSON.stringify(basePosition));
  p.current.price = 93; // near lower → widen
  const r = suggestRebalance(p);
  assert.ok(r.warnings.length > 0);
});