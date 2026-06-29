#!/usr/bin/env node
/**
 * tx_simulator.mjs — Simulate Solana transactions and decode results.
 *
 * Wraps Solana RPC `simulateTransaction` with helpful error handling.
 * Returns either:
 *   - { success: true, logs: [...] } on success
 *   - { success: false, error: ..., decoded: ... } on failure
 */

const DEFAULT_RPC = process.env.HELIUS_RPC || 'https://api.mainnet-beta.solana.com';

export async function simulateTransaction(base64Tx, options = {}) {
  const { rpc = DEFAULT_RPC, replaceRecentBlockhash = true, sigVerify = false } = options;

  const response = await fetch(rpc, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'simulateTransaction',
      params: [
        base64Tx,
        { replaceRecentBlockhash, sigVerify, commitment: 'confirmed' },
      ],
    }),
  });

  if (!response.ok) throw new Error(`RPC ${response.status}`);
  const data = await response.json();
  if (data.error) throw new Error(`RPC error: ${JSON.stringify(data.error)}`);

  return data.result;
}

/**
 * Parse Solana program logs into structured entries.
 * Each log line follows patterns like:
 *   "Program <id> invoke [depth]"
 *   "Program <id> success"
 *   "Program log: <message>"
 *   "Program <id> consumed <cu> of <total> compute units"
 *   "Program data: <base64>"
 */
export function parseLogs(logs) {
  const parsed = [];
  for (const log of logs) {
    let entry = { raw: log };

    if (log.match(/^Program \w+ invoke \[\d+\]$/)) {
      entry.type = 'invoke';
      const match = log.match(/^Program (\w+) invoke \[(\d+)\]$/);
      entry.programId = match[1];
      entry.depth = parseInt(match[2]);
    } else if (log.match(/^Program \w+ consumed (\d+) of (\d+) compute units$/)) {
      entry.type = 'consumed';
      const match = log.match(/^Program (\w+) consumed (\d+) of (\d+) compute units$/);
      entry.programId = match[1];
      entry.unitsConsumed = parseInt(match[2]);
      entry.unitsTotal = parseInt(match[3]);
    } else if (log.match(/^Program \w+ success$/)) {
      entry.type = 'success';
      const match = log.match(/^Program (\w+) success$/);
      entry.programId = match[1];
    } else if (log.startsWith('Program log: ')) {
      entry.type = 'log';
      entry.message = log.slice('Program log: '.length);
    } else if (log.startsWith('Program data: ')) {
      entry.type = 'data';
      entry.data = log.slice('Program data: '.length);
    } else if (log.startsWith('Program return: ')) {
      entry.type = 'return';
      entry.data = log.slice('Program return: '.length);
    } else {
      entry.type = 'other';
    }

    parsed.push(entry);
  }
  return parsed;
}

/**
 * Trace instruction calls from parsed logs.
 * Returns a tree of programs called.
 */
export function traceInstructions(parsedLogs) {
  const stack = [];
  const tree = { program: 'root', calls: [], unitsConsumed: 0 };

  for (const log of parsedLogs) {
    if (log.type === 'invoke') {
      stack.push({ program: log.programId, depth: log.depth, calls: [] });
    } else if (log.type === 'consumed') {
      const top = stack[stack.length - 1];
      if (top && top.program === log.programId) {
        top.unitsConsumed = log.unitsConsumed;
      }
    } else if (log.type === 'success') {
      const finished = stack.pop();
      if (finished) {
        if (stack.length === 0) {
          tree.calls.push(finished);
        } else {
          stack[stack.length - 1].calls.push(finished);
        }
      }
    }
  }

  return tree;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Demo: parse some example logs
  const sampleLogs = [
    'Program 11111111111111111111111111111111 invoke [1]',
    'Program 11111111111111111111111111111111 consumed 1500 of 200000 compute units',
    'Program 11111111111111111111111111111111 success',
    'Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA invoke [1]',
    'Program log: Instruction: Transfer',
    'Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA consumed 4500 of 200000 compute units',
    'Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA success',
  ];
  const parsed = parseLogs(sampleLogs);
  const trace = traceInstructions(parsed);
  console.log('Trace:', JSON.stringify(trace, null, 2));
}