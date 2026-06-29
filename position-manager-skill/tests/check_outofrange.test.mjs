import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { checkRange } from '../scripts/check_outofrange.mjs';

// Wide range so price=105 is comfortably in the middle, not near any bound.
const basePosition = {
  initial: { price_lower: 90, price_upper: 130 },
  current: { price: 105 },
};

test('checkRange: in-range yields none severity', () => {
  const r = checkRange(basePosition, 5);
  assert.equal(r.status, 'in_range');
  assert.equal(r.severity, 'none');
  assert.ok(r.recommendation.toLowerCase().includes('healthy'));
});

test('checkRange: below_range yields critical', () => {
  const p = JSON.parse(JSON.stringify(basePosition));
  p.current.price = 80; // 11% below lower (90)
  const r = checkRange(p, 5);
  assert.equal(r.status, 'below_range');
  assert.equal(r.severity, 'critical');
  assert.ok(r.recommendation.toLowerCase().includes('out of range'));
});

test('checkRange: above_range yields critical', () => {
  const p = JSON.parse(JSON.stringify(basePosition));
  p.current.price = 140; // 7.7% above upper (130)
  const r = checkRange(p, 5);
  assert.equal(r.status, 'above_range');
  assert.equal(r.severity, 'critical');
});

test('checkRange: near_lower warns within near_pct', () => {
  const p = JSON.parse(JSON.stringify(basePosition));
  p.current.price = 93; // 3.3% above lower (90), within 5%
  const r = checkRange(p, 5);
  assert.equal(r.status, 'near_lower');
  assert.equal(r.severity, 'warning');
});

test('checkRange: near_upper warns within near_pct', () => {
  const p = JSON.parse(JSON.stringify(basePosition));
  p.current.price = 125; // 3.85% below upper (130), within 5%
  const r = checkRange(p, 5);
  assert.equal(r.status, 'near_upper');
  assert.equal(r.severity, 'warning');
});

test('checkRange: at_bound when within 0.5% of either', () => {
  const p = JSON.parse(JSON.stringify(basePosition));
  p.current.price = 90.1; // 0.11% above lower
  const r = checkRange(p, 5);
  assert.equal(r.status, 'at_bound');
  assert.equal(r.severity, 'warning');
});

test('checkRange: missing fields yields unknown status', () => {
  const r = checkRange({ initial: {}, current: {} }, 5);
  assert.equal(r.status, 'unknown');
  assert.equal(r.severity, 'warning');
});

test('checkRange: numeric distances are computed', () => {
  const r = checkRange(basePosition, 5);
  assert.equal(typeof r.distance_to_lower_pct, 'number');
  assert.equal(typeof r.distance_to_upper_pct, 'number');
  assert.ok(r.distance_to_lower_pct > 0);
  assert.ok(r.distance_to_upper_pct > 0);
});

test('checkRange: custom near_pct changes threshold', () => {
  // Use a price that's IN range but close to the lower bound, so the
  // near_pct threshold actually matters. (Out-of-range is always critical
  // regardless of near_pct.)
  const p = JSON.parse(JSON.stringify(basePosition));
  p.current.price = 78; // 13.3% below lower (90)
  const r5 = checkRange(p, 5);
  const r15 = checkRange(p, 15);
  // With 5% threshold, 13.3% out is "below_range" (critical, since price < lower)
  assert.equal(r5.status, 'below_range');
  // With 15% threshold, 13.3% is still below the lower bound, so still below_range
  assert.equal(r15.status, 'below_range');

  // Now use a price that's in range but close to bound — near_pct matters
  const q = JSON.parse(JSON.stringify(basePosition));
  q.current.price = 78; // 13.3% below lower
  // Wait, that's still below the lower. Use 80 instead — still below range.
  // Better: use a scenario where price is in range but the threshold actually
  // separates near_lower from in_range.
  // With range [90, 130]: 95 is 5.56% above lower → between 5% and 15%
  // So with near_pct=5: in_range (5.56% > 5%)
  // With near_pct=15: near_lower (5.56% < 15%)
  const r = JSON.parse(JSON.stringify(basePosition));
  r.current.price = 95; // 5.56% above lower (90)
  const r5b = checkRange(r, 5);
  const r15b = checkRange(r, 15);
  assert.equal(r5b.status, 'in_range');
  assert.equal(r15b.status, 'near_lower');
});