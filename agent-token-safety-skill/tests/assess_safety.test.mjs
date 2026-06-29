import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { scoreSafety, WEIGHTS } from '../scripts/assess_safety.mjs';

test('WEIGHTS: sums to 1.0', () => {
  const sum = Object.values(WEIGHTS).reduce((s, w) => s + w, 0);
  assert.ok(Math.abs(sum - 1.0) < 0.001, `weights sum to ${sum}, expected 1.0`);
});

test('scoreSafety: empty report yields low risk (no signals)', () => {
  const r = scoreSafety({});
  // Empty report has implicit social_presence score (70) due to missing data
  // but with no other concerning signals, grade stays low.
  assert.equal(r.risk_grade, 'low');
  // No specific flags raised (no mint authority, no concentration data)
  assert.equal(r.flags.length, 0);
});

test('scoreSafety: clean token with all-good fields → low', () => {
  const r = scoreSafety({
    mint: 'TestMint1111111111111111111111111111111111',
    holders: { total_holders: 5000, top_10_pct: 15, top_1_pct: 3 },
    authorities: { mint_authority: null, freeze_authority: null, supply: 1000000, decimals: 9 },
    liquidity: { liquidity_usd: 500000, volume_24h_usd: 100000, pool_age_days: 90 },
    social: { has_twitter: true, has_website: true, twitter_followers: 10000 },
    trading: { volume_24h: 100000, buy_sell_ratio: 1.1, price_change_24h_pct: 2 },
  });
  assert.equal(r.risk_grade, 'low', `expected low, got ${r.risk_grade} (${r.risk_score})`);
  assert.ok(r.risk_score < 25);
});

test('scoreSafety: rug-pull pattern → critical', () => {
  const r = scoreSafety({
    mint: 'ScamMint1111111111111111111111111111111111',
    holders: { total_holders: 50, top_10_pct: 95, top_1_pct: 60 },
    authorities: { mint_authority: 'ActiveAuthority1111111111111111111111111111111', freeze_authority: null },
    liquidity: { liquidity_usd: 500, volume_24h_usd: 10000, pool_age_days: 1 },
    social: { has_twitter: false, has_website: false },
    trading: { volume_24h: 10000, buy_sell_ratio: 0.1, price_change_24h_pct: -30 },
  });
  assert.equal(r.risk_grade, 'critical', `expected critical, got ${r.risk_grade} (${r.risk_score})`);
  assert.ok(r.risk_score >= 75);
  // Should have multiple specific flags
  assert.ok(r.flags.length >= 3);
  // Should mention mint authority, top 10, low liquidity
  const joined = r.flags.join(' ').toLowerCase();
  assert.ok(joined.includes('mint authority') || joined.includes('top 10') || joined.includes('liquidity'));
});

test('scoreSafety: medium risk with some red flags', () => {
  const r = scoreSafety({
    mint: 'MidRiskMint11111111111111111111111111111111',
    holders: { total_holders: 200, top_10_pct: 55, top_1_pct: 18 },
    authorities: { mint_authority: null, freeze_authority: null },
    liquidity: { liquidity_usd: 8000, volume_24h_usd: 50000, pool_age_days: 5 },
    social: { has_twitter: true, has_website: false, twitter_followers: 200 },
    trading: { volume_24h: 50000, buy_sell_ratio: 0.3, price_change_24h_pct: 15 },
  });
  // Multiple red flags: top_10 55% (medium-high concentration), low liquidity $8k,
  // no website, sells-heavy ratio 0.3, young pool 5 days. Should be medium or high.
  assert.ok(['medium', 'high'].includes(r.risk_grade), `expected medium/high, got ${r.risk_grade} (${r.risk_score})`);
  assert.ok(r.risk_score >= 25, `expected risk_score >= 25, got ${r.risk_score}`);
});

test('scoreSafety: mint authority alone → high risk', () => {
  const r = scoreSafety({
    mint: 'MintedAuthMint111111111111111111111111111111',
    authorities: { mint_authority: 'ActiveAuthority1111111111111111111111111111111', freeze_authority: null },
  });
  assert.equal(r.risk_grade, 'high', `expected high (mint authority is critical), got ${r.risk_grade}`);
  assert.ok(r.component_scores.authorities === 100);
});

test('scoreSafety: low liquidity alone is concerning', () => {
  const r = scoreSafety({
    mint: 'LowLiqMint11111111111111111111111111111111',
    liquidity: { liquidity_usd: 500 },
  });
  assert.ok(r.flags.some((f) => f.toLowerCase().includes('liquidity')));
  assert.ok(r.component_scores.liquidity >= 80);
});

test('scoreSafety: anonymous team is a yellow flag', () => {
  const r = scoreSafety({
    mint: 'AnonTeamMint1111111111111111111111111111111',
    social: { has_twitter: false, has_website: false },
  });
  assert.ok(r.flags.some((f) => f.toLowerCase().includes('anonymous')));
});

test('scoreSafety: high buy/sell ratio flags wash buying', () => {
  const r = scoreSafety({
    mint: 'WashBuyMint111111111111111111111111111111111',
    trading: { buy_sell_ratio: 5.0, volume_24h: 1000, liquidity_usd: 5000 },
  });
  assert.ok(r.flags.some((f) => f.toLowerCase().includes('wash')));
});

test('scoreSafety: numeric output shape', () => {
  const r = scoreSafety({ mint: 'Shape11111111111111111111111111111111111111' });
  assert.equal(typeof r.risk_score, 'number');
  assert.equal(typeof r.risk_grade, 'string');
  assert.ok(Array.isArray(r.flags));
  assert.equal(typeof r.component_scores, 'object');
  // All component scores are 0-100
  for (const v of Object.values(r.component_scores)) {
    assert.ok(typeof v === 'number');
    assert.ok(v >= 0 && v <= 100);
  }
});