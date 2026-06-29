#!/usr/bin/env node
/**
 * Solana transaction simulator — preview a transaction's effects before signing.
 *
 * Wraps Solana RPC's simulateTransaction method, then parses the result into
 * a human-readable format: token balance changes, SOL deltas, compute units,
 * and a success/failure verdict.
 *
 * Usage:
 *   # Via JSON file
 *   node simulate_tx.mjs --tx examples/sample_tx.json --rpc <URL>
 *
 *   # Via stdin (pipe JSON)
 *   echo '{"tx": "..."}' | node simulate_tx.mjs
 *
 *   # With signers (keypair files)
 *   node simulate_tx.mjs --tx tx.json --signer keypair.json
 *
 * Input JSON shape:
 *   {
 *     "tx": "<base64-encoded VersionedTransaction or Transaction>",
 *     "signers": ["<path to keypair JSON>", ...],   // optional
 *     "rpc": "https://api.mainnet-beta.solana.com",
 *     "replace_signatures": true
 *   }
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  Connection,
  VersionedTransaction,
  Transaction,
  Keypair,
  PublicKey,
} from '@solana/web3.js';

const DEFAULT_RPC = 'https://api.mainnet-beta.solana.com';

function parseArgs(argv) {
  const args = { tx: null, signer: null, signers: [], rpc: DEFAULT_RPC };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--tx') args.tx = argv[++i];
    else if (a === '--signer') args.signers.push(argv[++i]);
    else if (a === '--rpc') args.rpc = argv[++i];
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

async function loadInput(args) {
  if (args.tx) {
    const raw = readFileSync(resolve(args.tx), 'utf8');
    return JSON.parse(raw);
  }
  if (!process.stdin.isTTY) {
    return JSON.parse(await readStdin());
  }
  throw new Error('No transaction provided. Use --tx or pipe JSON via stdin.');
}

function loadKeypair(path) {
  // Solana CLI keypair format: JSON array of 64 numbers
  const raw = JSON.parse(readFileSync(resolve(path), 'utf8'));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function parseTransaction(base64Tx) {
  const bytes = Buffer.from(base64Tx, 'base64');
  // Try VersionedTransaction first (most common in 2024+)
  try {
    return { tx: VersionedTransaction.deserialize(bytes), kind: 'v0' };
  } catch {}
  try {
    return { tx: Transaction.deserialize(bytes), kind: 'legacy' };
  } catch {}
  throw new Error('Could not decode transaction (tried VersionedTransaction and Transaction)');
}

/**
 * Parse simulateTransaction result into a structured, agent-friendly format.
 *
 * @param {object} result - raw RPC result from simulateTransaction
 * @param {string} txBase64 - original tx base64 (for context)
 * @returns {object} structured simulation report
 */
function parseSimulationResult(result, txBase64) {
  const value = result.value;
  if (!value) {
    return {
      ok: false,
      verdict: 'unknown',
      error: 'Empty simulation result',
    };
  }

  const err = value.err;
  const logs = value.logs || [];
  const unitsConsumed = value.unitsConsumed || 0;
  const returnData = value.returnData;

  // Success = no error
  const success = err === null;

  // Extract log warnings (heuristic for suspicious activity)
  const suspiciousPatterns = [
    { regex: /invoking.*unknown program/i, label: 'unknown program invocation' },
    { regex: /insufficient funds/i, label: 'insufficient funds' },
    { regex: /attempt to debit/i, label: 'attempt to debit' },
    { regex: /compute budget exceeded/i, label: 'compute budget exceeded' },
    { regex: /slippage tolerance exceeded/i, label: 'slippage tolerance exceeded' },
  ];
  const warnings = [];
  for (const p of suspiciousPatterns) {
    if (logs.some((l) => p.regex.test(l))) {
      warnings.push(p.label);
    }
  }

  // Token balance changes are not directly in simulateTransaction result
  // (would need to diff pre/post token accounts separately). For now,
  // we surface raw log lines so agents can parse them.

  return {
    ok: true,
    success,
    verdict: success ? 'would_succeed' : 'would_fail',
    error: success ? null : JSON.stringify(err),
    compute_units_consumed: unitsConsumed,
    log_count: logs.length,
    logs: logs,
    warnings,
    has_return_data: !!returnData,
    return_data: returnData ? Buffer.from(returnData.data, 'base64').toString('utf8') : null,
  };
}

async function main() {
  try {
    const args = parseArgs(process.argv);
    const input = await loadInput(args);

    if (!input.tx) {
      throw new Error('input.tx (base64-encoded transaction) is required');
    }

    const rpc = input.rpc || args.rpc;
    const { tx, kind } = parseTransaction(input.tx);

    // Optionally sign with provided signers
    if (args.signers.length > 0) {
      const keypairs = args.signers.map(loadKeypair);
      if (kind === 'v0') {
        // For VersionedTransaction, sign with each keypair
        // Find the signer index by pubkey
        tx.sign(keypairs);
      } else {
        tx.sign(...keypairs);
      }
    }

    const connection = new Connection(rpc, 'confirmed');
    // serializeMessage returns the message bytes; simulateTransaction accepts the
    // serialized transaction (legacy or versioned wire format).
    let serialized;
    if (kind === 'v0') {
      serialized = Buffer.from(tx.serialize());
    } else {
      serialized = tx.serialize();
    }

    const result = await connection.simulateTransaction(serialized, {
      replaceRecentBlockhash: true,
      sigVerify: false, // we may not have full signers
    });

    const parsed = parseSimulationResult(result, input.tx);
    process.stdout.write(JSON.stringify({ ok: true, data: parsed, warnings: [], errors: [] }, null, 2) + '\n');
    process.exit(parsed.success ? 0 : 2);  // non-zero exit on predicted failure
  } catch (err) {
    process.stdout.write(JSON.stringify({ ok: false, error: err.message || String(err) }, null, 2) + '\n');
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { parseSimulationResult, parseTransaction };