#!/usr/bin/env node
/**
 * Fetch token holder concentration via Solana RPC.
 *
 * Uses getTokenLargestAccounts (top 20 holders) + getTokenSupply.
 * For full holder list (more than top 20), use getProgramAccounts on the
 * associated token accounts — but that's expensive on mainnet.
 *
 * Usage:
 *   node fetch_holders.mjs --mint <MINT> [--rpc <URL>]
 */

const DEFAULT_RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

function parseArgs(argv) {
  const args = { mint: null, rpc: DEFAULT_RPC };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--mint') args.mint = argv[++i];
    else if (a === '--rpc') args.rpc = argv[++i];
  }
  return args;
}

function rpcCall(rpcUrl, method, params) {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
  return fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  }).then(async (r) => {
    if (!r.ok) throw new Error(`RPC HTTP ${r.status}`);
    const data = await r.json();
    if (data.error) throw new Error(`RPC error: ${data.error.message}`);
    return data.result;
  });
}

async function fetchHolders(mint, rpcUrl) {
  // Get supply
  const supplyInfo = await rpcCall(rpcUrl, 'getTokenSupply', [mint]);
  const supplyRaw = parseInt(supplyInfo.value.amount, 10);
  const decimals = parseInt(supplyInfo.value.decimals, 10);
  const supplyUi = supplyRaw / Math.pow(10, decimals);

  // Get top 20 holders
  const largest = await rpcCall(rpcUrl, 'getTokenLargestAccounts', [mint]);
  const topHolders = (largest.value || []).map((h) => ({
    address: h.address,
    amount_raw: h.amount,
    amount_ui: parseInt(h.amount, 10) / Math.pow(10, decimals),
    pct_of_supply: supplyRaw > 0 ? (parseInt(h.amount, 10) / supplyRaw) * 100 : 0,
  }));

  // Compute aggregate stats
  const top_1_pct = topHolders[0]?.pct_of_supply || 0;
  const top_10_pct = topHolders.slice(0, 10).reduce((s, h) => s + h.pct_of_supply, 0);
  const top_20_pct = topHolders.reduce((s, h) => s + h.pct_of_supply, 0);

  return {
    mint,
    supply: {
      raw: supplyRaw,
      ui: supplyUi,
      decimals,
    },
    total_holders: topHolders.length, // we only have top 20; real count is higher
    top_1_pct,
    top_10_pct,
    top_20_pct,
    top_holders: topHolders,
    note: 'total_holders reflects only the top 20 returned by getTokenLargestAccounts. For exact total holder count, use a third-party API like Helius or Birdeye.',
  };
}

async function main() {
  try {
    const args = parseArgs(process.argv);
    if (!args.mint) {
      console.error('Error: --mint <MINT> required');
      process.exit(2);
    }
    const result = await fetchHolders(args.mint, args.rpc);
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

export { fetchHolders };

// Suppress unused
void DEFAULT_RPC;