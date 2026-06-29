#!/usr/bin/env node
/**
 * jito_tip_estimator.mjs — Estimate Jito tip for transaction landing.
 *
 * Jito bundles compete on tip. Higher tip = better chance of landing.
 * But too high = wasted SOL. This skill recommends optimal tip based on
 * current mempool congestion.
 */

const TIPS = {
  LOW: { lamports: 1_000, label: 'low (1k lamports)', use: 'low value or non-urgent tx' },
  NORMAL: { lamports: 10_000, label: 'normal (10k lamports)', use: 'standard trade' },
  HIGH: { lamports: 100_000, label: 'high (100k lamports)', use: 'urgent, time-sensitive' },
  AGGRESSIVE: { lamports: 1_000_000, label: 'aggressive (1M lamports)', use: 'MEV-protected, must land' },
  NUCLEAR: { lamports: 10_000_000, label: 'nuclear (10M lamports)', use: 'extreme urgency, big trade' },
};

export function estimateOptimalTip(params) {
  const {
    txValueUsd = 0,
    mempoolCongestion = 'normal', // 'low' | 'normal' | 'high' | 'extreme'
    isTimeSensitive = false,
    isMevProtected = false,
  } = params;

  // Base tip from congestion
  const baseTips = { low: TIPS.LOW, normal: TIPS.NORMAL, high: TIPS.HIGH, extreme: TIPS.AGGRESSIVE };
  let recommended = baseTips[mempoolCongestion] || TIPS.NORMAL;

  // Bump up for time sensitivity
  if (isTimeSensitive) {
    recommended = bumpTip(recommended);
  }

  // Bump up for MEV protection (you need to outbid sandwich bots)
  if (isMevProtected) {
    recommended = bumpTip(recommended);
  }

  // Bump up for high-value tx
  if (txValueUsd > 100_000) {
    recommended = bumpTip(recommended);
  }
  if (txValueUsd > 1_000_000) {
    recommended = bumpTip(recommended);
  }

  // Calculate max sensible tip (don't tip more than 0.1% of tx value)
  const maxSensibleTip = txValueUsd > 0 ? Math.floor((txValueUsd * 0.001) * 1e9 / 70) : TIPS.NUCLEAR.lamports;
  // Cap if recommended exceeds max sensible
  const finalLamports = Math.min(recommended.lamports, maxSensibleTip);
  const capped = finalLamports < recommended.lamports;

  // Cost in USD
  const solUsd = 70;
  const tipUsd = (finalLamports / 1e9) * solUsd;

  return {
    recommended: recommended.label,
    lamports: finalLamports,
    tipUsd: Math.round(tipUsd * 1e6) / 1e6,
    mempoolCongestion,
    isTimeSensitive,
    isMevProtected,
    txValueUsd,
    cappedByValue: capped,
    rationale: buildRationale(recommended.label, mempoolCongestion, isTimeSensitive, isMevProtected, capped),
  };
}

function bumpTip(current) {
  const order = [TIPS.LOW, TIPS.NORMAL, TIPS.HIGH, TIPS.AGGRESSIVE, TIPS.NUCLEAR];
  const idx = order.findIndex(t => t.label === current.label);
  return order[Math.min(idx + 1, order.length - 1)];
}

function buildRationale(label, congestion, timeSensitive, mevProtected, capped) {
  const parts = [`Base: ${congestion} mempool`];
  if (timeSensitive) parts.push('time-sensitive +1 tier');
  if (mevProtected) parts.push('MEV-protected +1 tier');
  if (capped) parts.push('CAPPED at 0.1% of tx value (would otherwise be higher)');
  return parts.join('; ');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Demo scenarios
  console.log('=== Tip estimation scenarios ===\n');
  const scenarios = [
    { name: 'Small routine swap', params: { txValueUsd: 100, mempoolCongestion: 'normal' } },
    { name: 'Urgent MEV-protected arb', params: { txValueUsd: 50_000, mempoolCongestion: 'high', isMevProtected: true, isTimeSensitive: true } },
    { name: 'Whale liquidation', params: { txValueUsd: 5_000_000, mempoolCongestion: 'high', isTimeSensitive: true } },
    { name: 'Mempool is dead', params: { txValueUsd: 0, mempoolCongestion: 'low' } },
  ];
  for (const s of scenarios) {
    const tip = estimateOptimalTip(s.params);
    console.log(`${s.name}: ${tip.lamports} lamports (${tip.tipUsd} SOL ≈ $${tip.tipUsd})`);
    console.log(`  Rationale: ${tip.rationale}`);
    console.log();
  }
}