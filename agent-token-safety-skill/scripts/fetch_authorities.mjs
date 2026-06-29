#!/usr/bin/env node
/**
 * Fetch token mint + freeze authority from Solana RPC.
 *
 * Usage:
 *   node fetch_authorities.mjs --mint <MINT> [--rpc <URL>]
 *
 * Output JSON:
 *   {
 *     mint: "...",
 *     mint_authority: "..." | null,    // null = disabled
 *     freeze_authority: "..." | null,
 *     supply_raw: "...",
 *     supply_ui: number,
 *     decimals: number
 *   }
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

async function fetchAuthorities(mint, rpcUrl) {
  const accountInfo = await rpcCall(rpcUrl, 'getAccountInfo', [
    mint,
    { encoding: 'jsonParsed' },
  ]);

  if (!accountInfo.value) {
    throw new Error(`Mint ${mint} not found on-chain`);
  }

  const parsed = accountInfo.value.data.parsed.info;
  return {
    mint,
    mint_authority: parsed.mintAuthority ?? null,
    freeze_authority: parsed.freezeAuthority ?? null,
    supply_raw: parsed.supply,
    supply_ui: parseInt(parsed.supply, 10) / Math.pow(10, parsed.decimals),
    decimals: parsed.decimals,
    is_initialized: parsed.isInitialized,
  };
}

async function main() {
  try {
    const args = parseArgs(process.argv);
    if (!args.mint) {
      console.error('Error: --mint <MINT> required');
      process.exit(2);
    }
    const result = await fetchAuthorities(args.mint, args.rpc);
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

export { fetchAuthorities };

void DEFAULT_RPC;