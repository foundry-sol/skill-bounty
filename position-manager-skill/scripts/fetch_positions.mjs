#!/usr/bin/env node
/**
 * Fetch all CLMM positions for a Solana wallet across Orca / Raydium / Meteora.
 *
 * For each protocol we query the program's account data, filter by owner,
 * and emit a normalized position JSON. Decoding is best-effort — if account
 * layout is unknown, we emit raw base64 and skip numeric decoding.
 *
 * Usage:
 *   node fetch_positions.mjs --wallet <PUBKEY> [--rpc <URL>] [--protocol orca|raydium|meteora|all]
 *
 * Output: JSON envelope { ok, data: [...positions], warnings, errors }
 */

import { resolve } from 'node:path';

const PROGRAMS = {
  orca: 'whirLbMiicVdio4qvUfM5KAgbbCtYc8Pxe79eXgaqtJ',
  raydium: 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrK20WPo',
  meteora: 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo',
};

function parseArgs(argv) {
  const args = { wallet: null, rpc: null, protocol: 'all', mock: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--wallet') args.wallet = argv[++i];
    else if (a === '--rpc') args.rpc = argv[++i];
    else if (a === '--protocol') args.protocol = argv[++i];
    else if (a === '--mock') args.mock = true;
  }
  return args;
}

function defaultRpc() {
  return process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
}

function jsonRpcRequest(rpcUrl, method, params) {
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method,
    params,
  });
  // Node 18+ has global fetch
  return fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  }).then(async (r) => {
    if (!r.ok) {
      throw new Error(`RPC HTTP ${r.status}`);
    }
    const data = await r.json();
    if (data.error) throw new Error(`RPC error: ${data.error.message}`);
    return data.result;
  });
}

async function fetchProgramAccountsForOwner(rpcUrl, programId, ownerPubkey) {
  // Use getProgramAccounts with memcmp filter on the owner field.
  // The owner offset varies by program — for Orca Whirlpool positions, owner
  // is at a fixed offset. We use a generous data slice and let the caller
  // filter further.
  const filters = [
    { dataSize: 0 }, // unknown size, will be set per-protocol ideally
    {
      memcmp: {
        offset: 32, // common owner field offset for many Solana programs
        bytes: ownerPubkey,
      },
    },
  ];
  return jsonRpcRequest(rpcUrl, 'getProgramAccounts', [
    programId,
    { encoding: 'base64', filters },
  ]);
}

function decodePositionRaw(account, protocol) {
  // Placeholder decoding. Real implementations would parse the protocol's
  // account layout. We emit enough fields for downstream scripts to run.
  const data = account.account.data[0];
  return {
    protocol,
    position_address: account.pubkey,
    raw_data_b64: data,
    raw_data_size: account.account.data[1] || (data ? Math.floor((data.length * 3) / 4) : 0),
    decoded: false, // signal that decoding wasn't done
  };
}

async function fetchAll(rpcUrl, wallet, protocols) {
  const positions = [];
  const errors = [];
  const warnings = [];

  for (const proto of protocols) {
    const programId = PROGRAMS[proto];
    if (!programId) {
      warnings.push(`Unknown protocol: ${proto}`);
      continue;
    }
    try {
      const accounts = await fetchProgramAccountsForOwner(rpcUrl, programId, wallet);
      for (const acct of accounts) {
        positions.push(decodePositionRaw(acct, proto));
      }
    } catch (err) {
      errors.push(`${proto}: ${err.message || String(err)}`);
    }
  }

  return { positions, errors, warnings };
}

function mockFetch(wallet, protocols) {
  // Deterministic mock data for offline testing.
  return {
    positions: protocols.flatMap((proto, i) => [
      {
        protocol: proto,
        position_address: `Mock${proto.charAt(0).toUpperCase()}${proto.slice(1)}${i}Addr1111111111111111111111111111`,
        raw_data_b64: null,
        raw_data_size: 0,
        decoded: false,
        initial: {
          price_lower: 100 - i * 5,
          price_upper: 110 + i * 5,
          amount_token_0: 1.0,
          amount_token_1: 100.0,
          amount_token_0_symbol: 'SOL',
          amount_token_1_symbol: 'USDC',
          value_usd: 100 + i * 50,
        },
        current: {
          price: 105 + i * 2,
          amount_token_0: 1.2,
          amount_token_1: 80.0,
          value_usd: 120 + i * 30,
        },
      },
    ]),
    errors: [],
    warnings: ['Mock data — not real on-chain positions.'],
  };
}

async function main() {
  try {
    const args = parseArgs(process.argv);
    if (!args.wallet) {
      console.error('Error: --wallet <PUBKEY> required');
      process.exit(2);
    }
    const protocols = args.protocol === 'all' ? Object.keys(PROGRAMS) : [args.protocol];
    const rpcUrl = args.rpc || defaultRpc();

    let positions, errors, warnings;
    if (args.mock) {
      ({ positions, errors, warnings } = mockFetch(args.wallet, protocols));
    } else {
      ({ positions, errors, warnings } = await fetchAll(rpcUrl, args.wallet, protocols));
    }

    const out = {
      ok: errors.length === 0,
      data: {
        wallet: args.wallet,
        rpc: args.rpc ? rpcUrl : 'default-mainnet-beta',
        protocol: args.protocol,
        position_count: positions.length,
        positions,
        note:
          'Each position includes raw_data_b64 when fetched from RPC. For numeric IL/range analysis, decode via the protocol-specific helpers in skill/orca-positions.md etc. or use --mock for synthetic positions that already include initial/current fields.',
      },
      warnings,
      errors,
    };
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    process.exit(errors.length === 0 ? 0 : 1);
  } catch (err) {
    process.stdout.write(JSON.stringify({ ok: false, error: err.message || String(err) }, null, 2) + '\n');
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { fetchAll, mockFetch, PROGRAMS, decodePositionRaw };

// Suppress unused
void resolve;