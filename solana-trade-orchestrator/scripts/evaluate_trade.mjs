// solana-trade-orchestrator/scripts/evaluate_trade.mjs
//
// Composes agent-token-safety, position-manager, mev-sentry, and
// solana-staking-yield into a single evaluateTrade() decision.
//
// Each sub-skill is optional — if a skill is not available, that
// dimension is skipped with a neutral score.

const SAFETY_PASS = 50;       // neutral score if skill missing
const POSITION_PASS = 50;
const MEV_PASS = 50;
const STAKING_PASS = 50;

const SAFETY_WEIGHT = 0.35;
const POSITION_WEIGHT = 0.25;
const MEV_WEIGHT = 0.25;
const STAKING_WEIGHT = 0.15;

/**
 * Evaluate a proposed Solana trade across safety, MEV, position, and staking.
 *
 * @param {object} req
 * @param {string} req.mint - token mint address
 * @param {string} req.action - 'BUY' or 'SELL'
 * @param {number} req.position_size_usd - intended position size in USD
 * @param {string} [req.rpc] - Solana RPC URL
 * @param {object} [req.skill_paths] - override paths to skill folders
 * @returns {Promise<object>} decision
 */
export async function evaluateTrade(req) {
  const mint = req.mint;
  const action = req.action;
  const size = Number(req.position_size_usd || 0);

  if (!mint) throw new Error('mint required');
  if (!['BUY', 'SELL'].includes(action)) throw new Error('action must be BUY or SELL');
  if (size <= 0) throw new Error('position_size_usd must be > 0');

  // 1. Safety check
  const safety = await safeCheck(mint, req);

  // 2. MEV check (if it's a buy that hits Jupiter)
  const mev = action === 'BUY'
    ? await mevCheck(mint, size, req)
    : { sandwich_loss_usd: 0, jito_tip_usd: 0, use_jito: false };

  // 3. Position check (if entering a position)
  const position = await positionCheck(mint, size, action, req);

  // 4. Staking allocation
  const staking = stakingAllocation(size);

  // Compose decision
  const warnings = [];
  const critical = [];

  // Safety
  if (safety.grade === 'critical') {
    critical.push(`Safety: ${safety.flags.join(', ') || 'critical risk token'}`);
  } else if (safety.grade === 'high') {
    warnings.push(`Safety: high risk (score ${safety.score})`);
  }

  // MEV
  if (mev.sandwich_loss_usd > size * 0.10) {
    critical.push(`MEV: sandwich would lose $${mev.sandwich_loss_usd.toFixed(2)} (${(mev.sandwich_loss_usd/size*100).toFixed(1)}% of position)`);
  } else if (mev.sandwich_loss_usd > size * 0.05) {
    warnings.push(`MEV: high sandwich risk $${mev.sandwich_loss_usd.toFixed(2)} — Jito required`);
  } else if (mev.sandwich_loss_usd > size * 0.01) {
    warnings.push(`MEV: sandwich risk $${mev.sandwich_loss_usd.toFixed(2)} — use Jito`);
  }

  // Position
  if (position.il_pct > 0.10) {
    critical.push(`Position: ${(position.il_pct*100).toFixed(1)}% IL risk — rebalance first`);
  } else if (position.il_pct > 0.05) {
    warnings.push(`Position: ${(position.il_pct*100).toFixed(1)}% IL risk — tight range`);
  }

  // Position size cap by safety
  const size_cap = {
    critical: 0,
    high: 50,
    medium: 500,
    low: Infinity,
  }[safety.grade] ?? 500;

  // Final decision
  let allow = critical.length === 0;
  let position_size_usd = Math.min(size, size_cap);
  let use_jito = mev.sandwich_loss_usd > size * 0.01;

  // If position cap is 0, block
  if (position_size_usd <= 0) allow = false;

  // Score (0-100, higher = safer)
  const score_breakdown = {
    safety: safety.score ? 100 - safety.score : SAFETY_PASS,
    position: position.score || POSITION_PASS,
    mev: mev.score || MEV_PASS,
    staking: STAKING_PASS,  // not really a "risk" score
  };
  const score = Math.round(
    score_breakdown.safety * SAFETY_WEIGHT +
    score_breakdown.position * POSITION_WEIGHT +
    score_breakdown.mev * MEV_WEIGHT +
    score_breakdown.staking * STAKING_WEIGHT
  );

  // Build reason
  const reasons = [];
  if (safety.grade === 'low') reasons.push(`low safety risk (score ${safety.score || '?'})`);
  else if (safety.grade === 'medium') reasons.push(`medium safety risk`);
  if (position.in_range) reasons.push(`in-range CLMM position (IL ${(position.il_pct*100).toFixed(2)}%)`);
  if (mev.sandwich_loss_usd < size * 0.01) reasons.push(`low MEV risk`);
  else if (use_jito) reasons.push(`use Jito (sandwich risk $${mev.sandwich_loss_usd.toFixed(2)})`);
  if (staking.allocation_pct > 0) reasons.push(`${(staking.allocation_pct*100).toFixed(0)}% to LST`);

  return {
    allow,
    position_size_usd,
    reason: reasons.join(', ') || (critical.length ? critical.join('; ') : 'low confidence'),
    details: { safety, position, mev, staking },
    warnings,
    critical,
    score,
    score_breakdown,
    use_jito,
  };
}

// ─── Sub-skill integration ──────────────────────────────────────────────

async function safeCheck(mint, req) {
  try {
    const path = req.skill_paths?.safety ||
      '../../agent-token-safety-skill/scripts/assess_safety.mjs';
    const { assessSafety, getTokenReport } = await import(path);
    const report = await getTokenReport(mint, { rpc: req.rpc });
    return assessSafety(report);
  } catch (e) {
    return { grade: 'medium', score: 50, flags: [], error: e.message };
  }
}

async function mevCheck(mint, size, req) {
  try {
    const path = req.skill_paths?.mev ||
      '../../mev-sentry-skill/scripts/sandwich_detector.mjs';
    const { estimateSandwichLoss } = await import(path);
    // Rough estimate: assume 100K SOL pool for new tokens
    const result = estimateSandwichLoss({
      amountIn: size * 1e6,  // USDC has 6 decimals
      reserveIn: 100_000_000,
      reserveOut: 5_000_000_000,
      userSlippageBps: 100,
    });
    return {
      sandwich_loss_usd: result.user_loss || 0,
      jito_tip_usd: 0.001,  // standard tip
      use_jito: result.user_loss > size * 0.01,
      score: Math.max(0, 100 - (result.user_loss || 0) * 20),
    };
  } catch (e) {
    return { sandwich_loss_usd: 0, jito_tip_usd: 0, use_jito: false, error: e.message };
  }
}

async function positionCheck(mint, size, action, req) {
  try {
    if (action !== 'BUY') {
      return { in_range: true, il_pct: 0, score: 100 };
    }
    const path = req.skill_paths?.position ||
      '../../position-manager-skill/scripts/calculate_il.mjs';
    const { calculateIL } = await import(path);
    // Synthetic position: assume range [90, 110] and current = 100
    const il = calculateIL({
      initial: { price_lower: 90, price_upper: 110, amount_token_0: 1, amount_token_1: 100, value_usd: size },
      current: { price: 100, amount_token_0: 1, amount_token_1: 100, value_usd: size },
    });
    return {
      in_range: true,
      il_pct: Math.abs(il.il_pct || 0),
      score: 100 - Math.abs(il.il_pct || 0) * 100,
    };
  } catch (e) {
    return { in_range: true, il_pct: 0, score: 100, error: e.message };
  }
}

function stakingAllocation(size) {
  if (size < 100) return { allocation_pct: 0, suggested_apy: 0.07 };
  if (size < 1000) return { allocation_pct: 0.25, suggested_apy: 0.08 };
  return { allocation_pct: 0.50, suggested_apy: 0.085 };
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const [mint, action, size] = process.argv.slice(2);
  evaluateTrade({ mint, action, position_size_usd: Number(size) })
    .then(d => console.log(JSON.stringify(d, null, 2)))
    .catch(e => { console.error('Error:', e.message); process.exit(1); });
}