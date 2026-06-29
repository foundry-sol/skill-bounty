import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { calculateIL } from '../scripts/calculate_il.mjs';

// Self-consistent test data for an in-range 2-sided CLMM position.
// In a CLMM, a position's USD value is roughly constant within its range
// (modulo accumulated fees). So we model the position value as essentially
// unchanged at price 105, while the HODL value changes very slightly.
// Net: IL should be near 0 for a small in-range move.
const positionInRange = {
  protocol: 'orca',
  position_address: 'MockInRange111111111111111111111111111111111',
  initial: {
    price_lower: 90,
    price_upper: 130,
    amount_token_0: 1.0,
    amount_token_1: 110.0,
    value_usd: 200,
  },
  current: {
    price: 110,
    amount_token_0: 0.9,
    amount_token_1: 111.0,
    value_usd: 210, // slight fee earnings since open
  },
};

test('calculateIL: in-range position computes IL', () => {
  const r = calculateIL(positionInRange);
  assert.equal(r.in_range, true);
  assert.equal(r.price_lower, 90);
  assert.equal(r.price_upper, 130);
  assert.equal(r.current_price, 110);
  // For a small in-range move with fee earnings, absolute P&L should be positive
  // (position gained value). IL vs. HODL is small.
  assert.ok(r.absolute_pnl_pct > 0, `expected positive absolute P&L, got ${r.absolute_pnl_pct}`);
  // IL magnitude should be small for in-range move with wide range
  assert.ok(Math.abs(r.il_pct) < 0.10, `expected |IL| < 10%, got ${r.il_pct}`);
});

test('calculateIL: out-of-range below notes it', () => {
  const p = JSON.parse(JSON.stringify(positionInRange));
  p.current.price = 80; // below lower bound (90)
  const r = calculateIL(p);
  assert.equal(r.in_range, false);
  assert.ok(r.notes.some((n) => n.includes('below')));
});

test('calculateIL: out-of-range above notes it', () => {
  const p = JSON.parse(JSON.stringify(positionInRange));
  p.current.price = 140; // above upper bound (130)
  const r = calculateIL(p);
  assert.equal(r.in_range, false);
  assert.ok(r.notes.some((n) => n.includes('above')));
});

test('calculateIL: symmetric price (no change) → IL ≈ 0', () => {
  const p = JSON.parse(JSON.stringify(positionInRange));
  // current price at geometric center of bounds
  p.current.price = Math.sqrt(p.initial.price_lower * p.initial.price_upper);
  p.current.amount_token_0 = 1.0;
  p.current.amount_token_1 = 110.0;
  p.current.value_usd = 200; // no change in value
  const r = calculateIL(p);
  // At the geometric mean of the bounds, the formula's price_ratio ≈ 1, so
  // HODL multiplier ≈ 1 and IL should be very close to 0.
  assert.ok(Math.abs(r.il_pct) < 0.05, `expected ~0 IL at center price, got ${r.il_pct}`);
});

test('calculateIL: missing required field throws', () => {
  const bad = { initial: { price_lower: 100 }, current: { price: 105 } };
  assert.throws(() => calculateIL(bad), /required fields/);
});

test('calculateIL: numeric outputs are finite', () => {
  const r = calculateIL(positionInRange);
  assert.ok(Number.isFinite(r.il_pct));
  assert.ok(Number.isFinite(r.il_usd));
  assert.ok(Number.isFinite(r.hodl_value_usd));
  assert.ok(Number.isFinite(r.current_value_usd));
});