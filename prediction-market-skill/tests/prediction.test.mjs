// tests/prediction.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateEdge, portfolioEdge } from '../scripts/edge_calculator.mjs';
import { PositionTracker } from '../scripts/position_tracker.mjs';
import { normalizeMarkets } from '../scripts/prediction_data.mjs';

const EPS = 1e-9;
function assertApprox(actual, expected, eps = EPS, msg) {
  if (Math.abs(actual - expected) > eps) {
    throw new Error(`${msg || ''} expected ${expected} ± ${eps}, got ${actual}`);
  }
}

// ============================================================
// calculateEdge
// ============================================================

test('calculateEdge: positive edge suggests YES', () => {
  const r = calculateEdge({
    belief: 0.65, marketPrice: 0.50, confidence: 0.7, bankroll: 1000,
  });
  assert.equal(r.edgeDirection, 'YES');
  assert.equal(r.profitable, true);
  assertApprox(r.edge, 0.15);
  assert.ok(r.positionSize > 0);
});

test('calculateEdge: negative edge suggests No', () => {
  const r = calculateEdge({
    belief: 0.30, marketPrice: 0.50, confidence: 0.7, bankroll: 1000,
  });
  assert.equal(r.edgeDirection, 'NO');
  assert.equal(r.profitable, false);
  assert.ok(r.positionSize > 0);
});

test('calculateEdge: small edge (<2%) skips', () => {
  const r = calculateEdge({
    belief: 0.51, marketPrice: 0.50, confidence: 0.5, bankroll: 1000,
  });
  assert.equal(r.recommendation, 'SKIP');
});

test('calculateEdge: clamps Kelly at 25%', () => {
  const r = calculateEdge({
    belief: 1.0, marketPrice: 0.01, confidence: 1.0, bankroll: 1000,
  });
  // Even with massive edge and full confidence, should not exceed 25%
  assert.ok(r.kellyFraction <= 0.25);
});

test('calculateEdge: rejects invalid inputs', () => {
  assert.throws(() => calculateEdge({ belief: -0.1, marketPrice: 0.5, confidence: 0.5, bankroll: 1000 }));
  assert.throws(() => calculateEdge({ belief: 1.5, marketPrice: 0.5, confidence: 0.5, bankroll: 1000 }));
  assert.throws(() => calculateEdge({ belief: 0.5, marketPrice: -0.1, confidence: 0.5, bankroll: 1000 }));
  assert.throws(() => calculateEdge({ belief: 0.5, marketPrice: 0.5, confidence: 1.5, bankroll: 1000 }));
  assert.throws(() => calculateEdge({ belief: 0.5, marketPrice: 0.5, confidence: 0.5, bankroll: -1 }));
});

test('calculateEdge: zero confidence = no bet', () => {
  const r = calculateEdge({
    belief: 0.99, marketPrice: 0.01, confidence: 0, bankroll: 1000,
  });
  assert.equal(r.positionSize, 0);
});

test('calculateEdge: risk-adjusted score = edge * confidence', () => {
  const r = calculateEdge({
    belief: 0.7, marketPrice: 0.5, confidence: 0.5, bankroll: 1000,
  });
  assertApprox(r.riskAdjustedScore, 0.1);
});

// ============================================================
// portfolioEdge
// ============================================================

test('portfolioEdge: aggregates expected value', () => {
  const analyses = [
    calculateEdge({ belief: 0.7, marketPrice: 0.5, confidence: 0.7, bankroll: 1000 }),
    calculateEdge({ belief: 0.4, marketPrice: 0.5, confidence: 0.6, bankroll: 1000 }),
  ];
  const r = portfolioEdge(analyses);
  // Both analyses have non-zero position size (one YES, one NO) — both are actionable
  assert.equal(r.numTrades, 2);
  assert.ok(r.bestTrade);
});

test('portfolioEdge: empty = HOLD', () => {
  const r = portfolioEdge([]);
  assert.equal(r.recommendation, 'HOLD');
});

test('portfolioEdge: all positive = TAKE_TRADES', () => {
  const analyses = [
    calculateEdge({ belief: 0.8, marketPrice: 0.5, confidence: 0.8, bankroll: 1000 }),
    calculateEdge({ belief: 0.7, marketPrice: 0.5, confidence: 0.7, bankroll: 1000 }),
  ];
  const r = portfolioEdge(analyses);
  assert.equal(r.recommendation, 'TAKE_TRADES');
});

// ============================================================
// PositionTracker
// ============================================================

test('PositionTracker: open and list', () => {
  const t = new PositionTracker('/tmp/test-positions-' + Date.now() + '.json');
  t.open({ id: 'p1', platform: 'polymarket', marketId: 'm1', side: 'YES', size: 100, entryPrice: 0.5 });
  const open = t.getOpen();
  assert.equal(open.length, 1);
  assert.equal(open[0].id, 'p1');
});

test('PositionTracker: close and P&L', () => {
  const t = new PositionTracker('/tmp/test-positions-' + Date.now() + '.json');
  t.open({ id: 'p1', platform: 'polymarket', marketId: 'm1', side: 'YES', size: 100, entryPrice: 0.5 });
  const closed = t.close('p1', 0.7);
  assertApprox(closed.pnl, 20, 0.01); // 0.2 * 100, allow 1 cent precision
  assertApprox(closed.pnlPct, 40, 0.01);
  assert.equal(t.getOpen().length, 0);
});

test('PositionTracker: NO position P&L is inverted', () => {
  const t = new PositionTracker('/tmp/test-positions-' + Date.now() + '.json');
  t.open({ id: 'p1', platform: 'polymarket', marketId: 'm1', side: 'NO', size: 100, entryPrice: 0.5 });
  // For NO: profit when price drops
  const closed = t.close('p1', 0.3);
  assertApprox(closed.pnl, 20, 0.01);
});

test('PositionTracker: rejects invalid side', () => {
  const t = new PositionTracker('/tmp/test-positions-' + Date.now() + '.json');
  assert.throws(() => t.open({ id: 'p1', platform: 'p', marketId: 'm', side: 'INVALID', size: 100, entryPrice: 0.5 }));
});

test('PositionTracker: rejects negative size', () => {
  const t = new PositionTracker('/tmp/test-positions-' + Date.now() + '.json');
  assert.throws(() => t.open({ id: 'p1', platform: 'p', marketId: 'm', side: 'YES', size: -10, entryPrice: 0.5 }));
});

test('PositionTracker: rejects invalid entry price', () => {
  const t = new PositionTracker('/tmp/test-positions-' + Date.now() + '.json');
  assert.throws(() => t.open({ id: 'p1', platform: 'p', marketId: 'm', side: 'YES', size: 10, entryPrice: 1.5 }));
});

test('PositionTracker: portfolio aggregates', async () => {
  const t = new PositionTracker('/tmp/test-positions-' + Date.now() + '.json');
  t.open({ id: 'p1', platform: 'polymarket', marketId: 'm1', side: 'YES', size: 100, entryPrice: 0.5 });
  t.open({ id: 'p2', platform: 'polymarket', marketId: 'm2', side: 'NO', size: 50, entryPrice: 0.4 });
  t.close('p1', 0.6); // +10 realized
  const portfolio = await t.portfolio(async () => 0.5); // current price for both
  assertApprox(portfolio.realizedPnl, 10, 0.01);
  assert.equal(portfolio.positions.length, 1);
  // p2: NO position, current 0.5 vs entry 0.4 = loss of 0.1 * 50 = -5
  assertApprox(portfolio.unrealizedPnl, -5, 0.01);
});

// ============================================================
// normalizeMarkets
// ============================================================

test('normalizeMarkets: Polymarket format', () => {
  const raw = [
    {
      conditionId: '0x123',
      question: 'Will BTC hit 100k?',
      outcomePrices: ['0.45', '0.55'],
      volumeNum: 10000,
      endDate: '2026-12-31',
      slug: 'btc-100k',
      category: 'crypto',
      liquidity: '50000',
    },
  ];
  const markets = normalizeMarkets(raw, 'Polymarket');
  assert.equal(markets.length, 1);
  assert.equal(markets[0].source, 'polymarket');
  assert.equal(markets[0].yesPrice, 0.45);
  assert.equal(markets[0].volume, 10000);
  assert.equal(markets[0].question, 'Will BTC hit 100k?');
});

test('normalizeMarkets: Drift format', () => {
  const raw = {
    markets: [
      {
        marketIndex: 0,
        symbol: 'SOL-PERP',
        name: 'Solana Perpetual',
        volume24h: 5000000,
        expiryTs: 1735689600,
        category: 'crypto',
        openInterest: 1000000,
      },
    ],
  };
  const markets = normalizeMarkets(raw, 'Drift');
  assert.equal(markets.length, 1);
  assert.equal(markets[0].source, 'drift');
  assert.equal(markets[0].id, '0');
  assert.equal(markets[0].isPerp, true);
});

test('normalizeMarkets: Kalshi format', () => {
  const raw = {
    markets: [
      {
        ticker: 'KXBTC-100K',
        title: 'Will BTC hit 100k by year end?',
        yes_ask: 45, // cents
        no_ask: 55,
        volume: 5000,
        expiration_time: '2026-12-31T00:00:00Z',
        category: 'crypto',
        open_interest: 10000,
      },
    ],
  };
  const markets = normalizeMarkets(raw, 'Kalshi');
  assert.equal(markets.length, 1);
  assert.equal(markets[0].source, 'kalshi');
  assert.equal(markets[0].yesPrice, 0.45);
  assert.equal(markets[0].noPrice, 0.55);
});

test('normalizeMarkets: filters out zero-price markets', () => {
  const raw = [
    { conditionId: '1', question: 'Empty market', outcomePrices: ['0', '1'], volumeNum: 0 },
    { conditionId: '2', question: '', outcomePrices: ['0.5', '0.5'] },
  ];
  const markets = normalizeMarkets(raw, 'Polymarket');
  assert.equal(markets.length, 0);
});

test('normalizeMarkets: handles empty data', () => {
  assert.equal(normalizeMarkets([], 'Polymarket').length, 0);
  assert.equal(normalizeMarkets({}, 'Drift').length, 0);
  assert.equal(normalizeMarkets({ markets: [] }, 'Kalshi').length, 0);
});