#!/usr/bin/env node
/**
 * sandwich_detector.mjs — Estimate sandwich attack risk for a Solana swap.
 *
 * Given a swap (token_in, token_out, amount, slippage_bps, pool reserves),
 * estimate whether a sandwich attack is profitable for an attacker and
 * what the user could lose.
 *
 * Sandwich attack model:
 *   1. Attacker front-runs victim's buy with a small buy (moves price up)
 *   2. Victim's trade executes at worse price
 *   3. Attacker back-runs with a sell (captures the move)
 *
 * This skill flags high-risk swaps and suggests tighter slippage.
 */

const BPS = 10_000;

export function calculatePriceImpact(amountIn, reserveIn, reserveOut, feeBps = 30) {
  if (reserveIn <= 0 || reserveOut <= 0 || amountIn <= 0) {
    throw new Error('Invalid reserves or amount');
  }
  // Constant product AMM (Raydium-style): dy = (y * dx) / (x + dx), minus fee
  const amountInWithFee = amountIn * (BPS - feeBps);
  const numerator = amountInWithFee * reserveOut;
  const denominator = reserveIn * BPS + amountInWithFee;
  const amountOut = numerator / denominator;
  const executionPrice = amountIn > 0 ? amountOut / amountIn : 0;
  // Marginal price (after the trade): reserveOut' / reserveIn'
  const newReserveIn = reserveIn + amountIn;
  const newReserveOut = reserveOut - amountOut;
  const marginalPrice = newReserveOut / newReserveIn;
  // Spot price before: reserveOut / reserveIn
  const spotPrice = reserveOut / reserveIn;
  // Price impact = 1 - (marginalPrice / spotPrice)
  const priceImpact = spotPrice > 0 ? 1 - marginalPrice / spotPrice : 0;
  return {
    amountOut,
    spotPrice,
    marginalPrice,
    priceImpact,
  };
}

export function estimateSandwichLoss(params) {
  const { amountIn, reserveIn, reserveOut, userSlippageBps, feeBps = 30, attackerCapitalUsd = 1000 } = params;
  if (!amountIn || !reserveIn || !reserveOut) {
    throw new Error('amountIn, reserveIn, reserveOut required');
  }
  // Without sandwich: user gets normal AMM output
  const normal = calculatePriceImpact(amountIn, reserveIn, reserveOut, feeBps);
  const userExpectedOut = normal.amountOut;

  // Simulate sandwich: attacker front-runs with attackerCapital
  // Convert attacker capital to "amountIn" units (assuming 1:1 USD for stablecoins)
  const attackerAmountIn = attackerCapitalUsd;
  const afterFront = calculatePriceImpact(attackerAmountIn, reserveIn, reserveOut, feeBps);
  const newReserveIn = reserveIn + attackerAmountIn;
  const newReserveOut = reserveOut - afterFront.amountOut;

  // Victim's trade now happens at worse price
  const sandwiched = calculatePriceImpact(amountIn, newReserveIn, newReserveOut, feeBps);
  const victimActualOut = sandwiched.amountOut;

  // Attacker back-runs: sells what they bought at the new higher price
  const backRun = calculatePriceImpact(afterFront.amountOut, newReserveIn + amountIn, newReserveOut - victimActualOut, feeBps);
  const attackerFinalOut = backRun.amountOut;
  const attackerProfit = attackerFinalOut - attackerCapitalUsd;

  const userLoss = userExpectedOut - victimActualOut;
  const userLossPct = userExpectedOut > 0 ? (userLoss / userExpectedOut) * 100 : 0;
  const userLossBps = userExpectedOut > 0 ? (userLoss / userExpectedOut) * BPS : 0;

  // If user slippage allows the loss, it's a viable sandwich
  // i.e., if user loss < user slippage, attacker can extract that value
  const isViableSandwich = userLossBps <= userSlippageBps && attackerProfit > 0;
  const riskLevel = userLossBps > userSlippageBps * 0.5 ? 'high'
    : userLossBps > userSlippageBps * 0.2 ? 'medium'
    : 'low';

  return {
    userExpectedOut,
    victimActualOut,
    userLoss,
    userLossPct,
    userLossBps,
    attackerProfit,
    isViableSandwich,
    riskLevel,
    recommendation: recommendationForRisk(riskLevel, userSlippageBps),
  };
}

function recommendationForRisk(riskLevel, userSlippageBps) {
  if (riskLevel === 'high') {
    return {
      action: 'block',
      message: `High sandwich risk with ${userSlippageBps} bps slippage. Reduce to 30 bps or use Jito bundle.`,
    };
  }
  if (riskLevel === 'medium') {
    return {
      action: 'tighten',
      message: `Medium sandwich risk. Consider reducing slippage to 50 bps.`,
    };
  }
  return {
    action: 'proceed',
    message: 'Low sandwich risk. Trade can proceed.',
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Demo: large trade on a thin pool
  const result = estimateSandwichLoss({
    amountIn: 50_000,  // user trading 50k USDC
    reserveIn: 100_000,
    reserveOut: 5_000_000,  // thin: 50k of 100k reserve
    userSlippageBps: 100,
    feeBps: 30,
    attackerCapitalUsd: 5000,
  });
  console.log('Sandwich analysis:');
  console.log(JSON.stringify(result, null, 2));
}