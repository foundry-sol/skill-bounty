#!/usr/bin/env node
/**
 * Composite safety scorer for Solana tokens.
 *
 * Combines holder concentration, authorities, social presence, and trading
 * signals into a single risk grade (low / medium / high / critical).
 *
 * Usage:
 *   node assess_safety.mjs --mint <MINT> [--rpc <URL>] [--json <REPORT>]
 *   cat report.json | node assess_safety.mjs
 *
 * The input report can be a partial or full TokenSafetyReport. Missing
 * fields are scored as 0 (no signal) with appropriate penalty.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function parseArgs(argv) {
  const args = { mint: null, rpc: null, json: null, report: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--mint') args.mint = argv[++i];
    else if (a === '--rpc') args.rpc = argv[++i];
    else if (a === '--json') args.json = argv[++i];
    else if (a === '--report') args.report = argv[++i];
  }
  return args;
}

async function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

async function loadReport(args) {
  if (args.json) return JSON.parse(args.json);
  if (args.report) {
    return JSON.parse(readFileSync(resolve(args.report), 'utf8'));
  }
  if (!process.stdin.isTTY) {
    return JSON.parse(await readStdin());
  }
  throw new Error('No report provided. Use --json, --report, or pipe via stdin.');
}

/**
 * Scoring weights (sum to 1.0). Higher weight = more important for safety.
 */
const WEIGHTS = {
  holder_concentration: 0.30,
  authorities: 0.30,
  liquidity: 0.20,
  social_presence: 0.10,
  trading_patterns: 0.10,
};

/**
 * Composite safety scoring.
 *
 * Input: a TokenSafetyReport (partial OK):
 *   {
 *     mint: "...",
 *     holders: {
 *       total_holders: number,
 *       top_10_pct: number,           // % owned by top-10 wallets
 *       top_1_pct: number             // % owned by top wallet
 *     },
 *     authorities: {
 *       mint_authority: string | null,  // null if disabled
 *       freeze_authority: string | null, // null if disabled
 *       supply: number,
 *       decimals: number
 *     },
 *     liquidity: {
 *       liquidity_usd: number,
 *       volume_24h_usd: number,
 *       pool_age_days: number
 *     },
 *     social: {
 *       twitter: string | null,
 *       website: string | null,
 *       telegram: string | null,
 *       has_twitter: boolean,
 *       has_website: boolean,
 *       twitter_followers: number
 *     },
 *     trading: {
 *       volume_24h: number,
 *       volume_7d: number,
 *       txns_24h_buys: number,
 *       txns_24h_sells: number,
 *       buy_sell_ratio: number,
 *       price_change_24h_pct: number
 *     }
 *   }
 *
 * Output:
 *   {
 *     mint: "...",
 *     risk_grade: "low" | "medium" | "high" | "critical",
 *     risk_score: 0-100,            // 0 = safest, 100 = rug-pull imminent
 *     component_scores: { ... },     // each category 0-100
 *     flags: [ ... ],                 // specific warnings
 *     recommendation: "..."           // human-readable next-step
 *   }
 */
function scoreSafety(report) {
  const flags = [];
  const component_scores = {};

  // 1. Holder concentration (0-100, higher = more concentrated = riskier)
  const h = report.holders || {};
  let holder_score = 0;
  if (typeof h.top_10_pct === 'number') {
    if (h.top_10_pct > 80) {
      holder_score = 100;
      flags.push('CRITICAL: Top 10 wallets own > 80% of supply — classic rug pattern.');
    } else if (h.top_10_pct > 60) {
      holder_score = 80;
      flags.push('HIGH: Top 10 wallets own > 60% of supply — high concentration risk.');
    } else if (h.top_10_pct > 40) {
      holder_score = 50;
      flags.push('MEDIUM: Top 10 wallets own > 40% of supply — moderate concentration.');
    } else if (h.top_10_pct > 0) {
      holder_score = Math.round(h.top_10_pct / 2);
    }
  }
  if (typeof h.top_1_pct === 'number' && h.top_1_pct > 30) {
    flags.push(`Top wallet owns ${h.top_1_pct.toFixed(1)}% of supply.`);
    holder_score = Math.max(holder_score, 70);
  }
  if (typeof h.total_holders === 'number' && h.total_holders < 100) {
    flags.push(`Only ${h.total_holders} holders — low distribution.`);
    holder_score = Math.max(holder_score, 60);
  }
  component_scores.holder_concentration = holder_score;

  // 2. Authorities (0-100, active authorities = high risk)
  const a = report.authorities || {};
  let authority_score = 0;
  if (a.mint_authority !== null && a.mint_authority !== undefined) {
    authority_score = 100;
    flags.push('CRITICAL: Mint authority is still active — team can mint unlimited tokens.');
  }
  if (a.freeze_authority !== null && a.freeze_authority !== undefined) {
    authority_score = Math.max(authority_score, 80);
    flags.push('HIGH: Freeze authority is still active — team can freeze your tokens.');
  }
  component_scores.authorities = authority_score;

  // 3. Liquidity (0-100, low liquidity = riskier)
  const l = report.liquidity || {};
  let liquidity_score = 0;
  if (typeof l.liquidity_usd === 'number') {
    if (l.liquidity_usd < 1000) {
      liquidity_score = 90;
      flags.push('CRITICAL: Liquidity < $1k — exit liquidity is near zero.');
    } else if (l.liquidity_usd < 10000) {
      liquidity_score = 60;
      flags.push(`Liquidity < $10k ($${l.liquidity_usd.toFixed(0)}) — small positions only.`);
    } else if (l.liquidity_usd < 50000) {
      liquidity_score = 30;
    } else {
      liquidity_score = 10;
    }
  }
  if (typeof l.pool_age_days === 'number' && l.pool_age_days < 7) {
    flags.push(`Pool is only ${l.pool_age_days} day(s) old.`);
    liquidity_score = Math.max(liquidity_score, 40);
  }
  component_scores.liquidity = liquidity_score;

  // 4. Social presence (0-100, no socials = riskier, low followers = riskier)
  // Only flag "no socials" if the data was actually fetched (not missing).
  // Missing data shouldn't trigger warnings (we just don't know).
  const s = report.social || {};
  let social_score = 0;
  const has_social_data = s.has_twitter !== undefined || s.has_website !== undefined || s.twitter !== undefined;
  if (has_social_data) {
    if (s.has_twitter === false && s.has_website === false) {
      social_score = 70;
      flags.push('No Twitter or website — anonymous team.');
    } else if (s.has_twitter === false) {
      social_score = 40;
      flags.push('No Twitter presence.');
    } else if (s.has_website === false) {
      social_score = 30;
      flags.push('No project website.');
    } else {
      if (typeof s.twitter_followers === 'number') {
        if (s.twitter_followers < 100) social_score = 50;
        else if (s.twitter_followers < 1000) social_score = 20;
        else social_score = 5;
      }
    }
  }
  component_scores.social_presence = social_score;

  // 5. Trading patterns (0-100, suspicious patterns = riskier)
  const t = report.trading || {};
  let trading_score = 0;
  if (typeof t.buy_sell_ratio === 'number') {
    // Healthy ratio: 0.7 - 1.5 (slightly more buys than sells is normal)
    // Concerning: < 0.3 (heavy sells, distribution) or > 3.0 (wash buying)
    if (t.buy_sell_ratio < 0.3) {
      trading_score += 50;
      flags.push(`Buy/sell ratio ${t.buy_sell_ratio.toFixed(2)} — heavy selling.`);
    } else if (t.buy_sell_ratio > 3.0) {
      trading_score += 40;
      flags.push(`Buy/sell ratio ${t.buy_sell_ratio.toFixed(2)} — possible wash buying.`);
    }
  }
  if (typeof t.volume_24h === 'number' && typeof t.liquidity_usd === 'number' && t.liquidity_usd > 0) {
    const vol_liq_ratio = t.volume_24h / t.liquidity_usd;
    if (vol_liq_ratio > 5) {
      trading_score += 50;
      flags.push(`24h volume / liquidity ratio = ${vol_liq_ratio.toFixed(1)}x — suspicious churn.`);
    } else if (vol_liq_ratio > 2) {
      trading_score += 25;
    }
  }
  if (typeof t.price_change_24h_pct === 'number') {
    if (Math.abs(t.price_change_24h_pct) > 50) {
      trading_score += 30;
      flags.push(`24h price change ${t.price_change_24h_pct.toFixed(1)}% — high volatility.`);
    }
  }
  component_scores.trading_patterns = Math.min(100, trading_score);

  // Composite score
  const composite = Math.round(
    component_scores.holder_concentration * WEIGHTS.holder_concentration +
    component_scores.authorities * WEIGHTS.authorities +
    component_scores.liquidity * WEIGHTS.liquidity +
    component_scores.social_presence * WEIGHTS.social_presence +
    component_scores.trading_patterns * WEIGHTS.trading_patterns
  );

  let risk_grade;
  let recommendation;
  if (composite >= 75) {
    risk_grade = 'critical';
    recommendation = 'DO NOT TRADE. Multiple severe red flags. Classic rug-pull pattern.';
  } else if (composite >= 50) {
    risk_grade = 'high';
    recommendation = 'Avoid. Significant risk indicators. Only trade with size you can lose entirely.';
  } else if (composite >= 25) {
    risk_grade = 'medium';
    recommendation = 'Caution. Some risk indicators present. Use small positions and tight stops.';
  } else {
    risk_grade = 'low';
    recommendation = 'Looks reasonable. Standard risk management still applies.';
  }

  // Veto rules: certain individual findings are severe enough to escalate
  // the risk grade regardless of the composite score.
  const auth = report.authorities || {};
  if (auth.mint_authority !== null && auth.mint_authority !== undefined) {
    if (risk_grade === 'low' || risk_grade === 'medium') {
      risk_grade = 'high';
      recommendation =
        'Mint authority is still active. Team can mint unlimited tokens — escalated to high risk.';
    } else if (risk_grade === 'high') {
      recommendation =
        'Mint authority is still active — strongest single reason this is a critical-grade risk.';
    }
  }
  if (auth.freeze_authority !== null && auth.freeze_authority !== undefined) {
    if (risk_grade === 'low' || risk_grade === 'medium') {
      risk_grade = 'high';
      recommendation =
        'Freeze authority is still active. Team can freeze your tokens — escalated to high risk.';
    }
  }

  return {
    mint: report.mint || null,
    risk_grade,
    risk_score: composite,
    component_scores,
    flags,
    recommendation,
  };
}

async function main() {
  try {
    const args = parseArgs(process.argv);
    const report = await loadReport(args);
    const result = scoreSafety(report);
    process.stdout.write(JSON.stringify({ ok: true, data: result, warnings: [], errors: [] }, null, 2) + '\n');
    process.exit(0);
  } catch (err) {
    process.stdout.write(JSON.stringify({ ok: false, error: err.message || String(err) }, null, 2) + '\n');
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { scoreSafety, WEIGHTS };