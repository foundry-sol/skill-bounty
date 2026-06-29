#!/usr/bin/env node
/**
 * sandwich_simulator.mjs — Simulate sandwich attack outcomes.
 *
 * For research/educational purposes only. Models what an attacker
 * would do and what the victim loses, so defenders can size protections.
 *
 * Usage:
 *   node sandwich_simulator.mjs --amount 50000 --reserve-in 100000 --reserve-out 5000000
 */

const BPS = 10_000;

export function simulateSandwich(params) {
  const {
    amountIn,
    reserveIn,
    reserveOut,
    feeBps = 30,
    attackerCapitals = [100, 1000, 5000, 10000, 50000],
  } = params;

  if (amountIn <= 0 || reserveIn <= 0 || reserveOut <= 0) {
    throw new Error('amountIn, reserveIn, reserveOut must be positive');
  }

  const scenarios = attackerCapitals.map(capital => {
    // Step 1: Attacker front-runs
    const frontOut = trade(capital, reserveIn, reserveOut, feeBps).out;
    const newReserveIn = reserveIn + capital;
    const newReserveOut = reserveOut - frontOut;

    // Step 2: Victim's swap at worse price
    const victimOut = trade(amountIn, newReserveIn, newReserveOut, feeBps).out;
    const finalReserveIn = newReserveIn + amountIn;
    const finalReserveOut = newReserveOut - victimOut;

    // Step 3: Attacker back-runs at victim's expense
    const backOut = trade(frontOut, finalReserveIn, finalReserveOut, feeBps).out;
    const attackerProfit = backOut - capital;
    const attackerRoi = capital > 0 ? (attackerProfit / capital) * 100 : 0;
    const normalOut = trade(amountIn, reserveIn, reserveOut, feeBps).out;
    const victimLoss = normalOut - victimOut;

    return {
      attackerCapital: capital,
      victimOut,
      normalOut,
      victimLoss,
      attackerProfit,
      attackerRoi: Math.round(attackerRoi * 100) / 100,
    };
  });

  return scenarios;
}

function trade(amountIn, reserveIn, reserveOut, feeBps) {
  const amountInWithFee = amountIn * (BPS - feeBps);
  const numerator = amountInWithFee * reserveOut;
  const denominator = reserveIn * BPS + amountInWithFee;
  return {
    out: numerator / denominator,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('=== Sandwich simulation: 50k USDC trade on a 100k-reserve pool ===\n');
  const scenarios = simulateSandwich({
    amountIn: 50_000,
    reserveIn: 100_000,
    reserveOut: 5_000_000,
  });
  console.log('AttackerCap | VictimLoss | AttackerProfit | ROI');
  console.log('------------|------------|----------------|--------');
  for (const s of scenarios) {
    console.log(
      `${String(s.attackerCapital).padStart(11)} | ${String(s.victimLoss.toFixed(2)).padStart(10)} | ${String(s.attackerProfit.toFixed(2)).padStart(14)} | ${s.attackerRoi.toFixed(2)}%`
    );
  }
}