#!/usr/bin/env node
/**
 * Fetch social presence for a Solana token via DexScreener.
 *
 * Usage:
 *   node fetch_social.mjs --mint <MINT>
 *
 * Output JSON includes Twitter / website / Telegram links if present.
 */

const DEXSCREENER_TOKEN_URL = 'https://api.dexscreener.com/latest/dex/tokens/';

function parseArgs(argv) {
  const args = { mint: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--mint') args.mint = argv[++i];
  }
  return args;
}

function get(url, timeoutMs = 15000) {
  return fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
      'Accept': 'application/json',
    },
  }).then(async (r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });
}

function safeHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

async function fetchSocial(mint) {
  const url = `${DEXSCREENER_TOKEN_URL}${mint}`;
  const data = await get(url);
  const pairs = data.pairs || [];
  if (pairs.length === 0) {
    return {
      mint,
      found: false,
      social: {
        has_twitter: false,
        has_website: false,
        twitter: null,
        website: null,
        telegram: null,
        twitter_followers: null,
      },
      note: 'Token not found in DexScreener. Social data unavailable.',
    };
  }

  // Aggregate social from all pairs (usually the same info)
  const social = {
    has_twitter: false,
    has_website: false,
    twitter: null,
    website: null,
    telegram: null,
    twitter_followers: null,
  };

  for (const pair of pairs) {
    const info = pair.info || {};
    if (info.twitter && !social.twitter) {
      social.twitter = info.twitter;
      social.has_twitter = true;
    }
    if (info.websites && info.websites.length > 0 && !social.website) {
      social.website = info.websites[0];
      social.has_website = true;
    }
  }

  return {
    mint,
    found: true,
    pair_count: pairs.length,
    social,
    note: 'Twitter follower count requires a separate API call (Twitter/X API or social-data provider).',
  };
}

async function main() {
  try {
    const args = parseArgs(process.argv);
    if (!args.mint) {
      console.error('Error: --mint <MINT> required');
      process.exit(2);
    }
    const result = await fetchSocial(args.mint);
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

export { fetchSocial };

void safeHostname;