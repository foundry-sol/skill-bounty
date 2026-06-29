#!/usr/bin/env node
/**
 * edge_calculator.mjs — Calculate edge and expected value for prediction market trades.
 *
 * Given a market and a belief about the true probability, calculate:
 *   - Edge: difference between belief and market price
 *   - Expected value: expected profit per $1 bet
 *   - Kelly fraction: optimal bet size for bankroll growth
 *   - Risk-adjusted score: edge * confidence (0-1)
 */

const MAX_KELLY_FRACTION = 0.25; // Never bet more than 25% of bankroll on a single market

/**
 * Calculate edge and trade recommendation.
 * @param {Object} params
 * @param {number} params.belief - Your probability estimate (0-1)
 * @param {number} params.marketPrice - Current YES price (0-1)
 * @param {number} params.confidence - Confidence in your belief (0-1)
 * @param {number} params.bankroll - Total bankroll in USD
 * @returns {Object} Trade analysis
 */
export function calculateEdge({ belief, marketPrice, confidence, bankroll }) {
  if (belief < 0 || belief > 1) throw new Error('belief must be 0-1');
  if (marketPrice < 0 || marketPrice > 1) throw new Error('marketPrice must be 0-1');
  if (confidence < 0 || confidence > 1) throw new Error('confidence must be 0-1');
  if (bankroll < 0) throw new Error('bankroll must be positive');

  const edge = belief - marketPrice;
  const edgeDirection = edge > 0 ? 'YES' : 'NO';
  const expectedValue = edge; // Per $1 bet, in expectation
  const edgePct = edge * 100;

  // Kelly fraction: f* = (p * b - q) / b
  // where p = probability of winning, b = net odds, q = 1 - p
  // Simplified: f* = edge / (1 - marketPrice) for YES
  const kellyYes = edge > 0 ? (edge / (1 - marketPrice)) : 0;
  const kellyNo = edge < 0 ? (-edge / marketPrice) : 0;
  const kellyRaw = Math.max(0, Math.max(kellyYes, kellyNo));
  const kellyFraction = Math.min(kellyRaw * confidence, MAX_KELLY_FRACTION);

  // Risk-adjusted score
  const riskAdjustedScore = edge * confidence;

  // Position size in USD
  const positionSize = bankroll * kellyFraction;

  // Recommendation
  let recommendation;
  if (Math.abs(edge) < 0.02) {
    recommendation = 'SKIP'; // Less than 2% edge, not worth the fees
  } else if (kellyFraction < 0.001) {
    recommendation = 'SKIP'; // Too small to act on
  } else if (edge > 0) {
    recommendation = `BUY YES for $${positionSize.toFixed(2)}`;
  } else {
    recommendation = `BUY NO for $${positionSize.toFixed(2)}`;
  }

  return {
    edge,
    edgePct,
    edgeDirection,
    expectedValue,
    confidence,
    riskAdjustedScore,
    kellyRaw,
    kellyFraction,
    positionSize,
    recommendation,
    profitable: edge > 0,
  };
}

/**
 * Calculate expected value across multiple markets.
 * Useful for "should I trade" decisions.
 */
export function portfolioEdge(analyses) {
  if (!analyses || analyses.length === 0) {
    return { totalEV: 0, bestTrade: null, recommendation: 'HOLD' };
  }
  let totalEV = 0;
  let bestTrade = null;
  for (const a of analyses) {
    totalEV += a.expectedValue * a.positionSize;
    if (!bestTrade || a.riskAdjustedScore > bestTrade.riskAdjustedScore) {
      bestTrade = a;
    }
  }
  return {
    totalEV,
    bestTrade,
    numTrades: analyses.filter(a => a.positionSize > 0).length,
    recommendation: totalEV > 0 ? 'TAKE_TRADES' : 'HOLD',
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Demo
  const analysis = calculateEdge({
    belief: 0.65,        // I think 65% chance YES
    marketPrice: 0.50,   // Market says 50%
    confidence: 0.7,     // 70% confident in my belief
    bankroll: 1000,
  });
  console.log('Trade analysis:');
  console.log(JSON.stringify(analysis, null, 2));
}