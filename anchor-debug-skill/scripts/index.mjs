#!/usr/bin/env node
/**
 * Anchor debug CLI for Solana agents.
 *
 * Usage:
 *   anchor-debug decode <code>
 *   anchor-debug decode-tx <json-file>
 *   anchor-debug parse-logs <logs-file>
 *   anchor-debug demo
 */

import { decodeError, decodeTransactionError, suggestFix } from './error_decoder.mjs';
import { parseLogs, traceInstructions } from './tx_simulator.mjs';

const HELP = `
anchor-debug — Anchor program debugging toolkit

Commands:
  decode       Decode an Anchor error code
  decode-tx    Decode a Solana transaction error
  parse-logs   Parse Solana program logs
  demo         Run all demos

Examples:
  anchor-debug decode 100
  anchor-debug decode 6000
  anchor-debug decode-tx error.json
  anchor-debug parse-logs logs.txt
`;

function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (!cmd || cmd === '--help' || cmd === '-h') {
    console.log(HELP);
    return;
  }
  if (cmd === 'demo') return runDemo();
  if (cmd === 'decode') return runDecode(args);
  if (cmd === 'decode-tx') return runDecodeTx(args);
  if (cmd === 'parse-logs') return runParseLogs(args);
  console.log(`Unknown command: ${cmd}\n${HELP}`);
}

function runDecode(args) {
  const code = args[0];
  if (!code) {
    console.log('Need an error code');
    return;
  }
  const parsed = isNaN(parseInt(code)) ? code : parseInt(code);
  const result = decodeError(parsed);
  console.log(JSON.stringify(result, null, 2));
}

function runDecodeTx(args) {
  const file = args[0];
  if (!file) {
    console.log('Need a path to a JSON error file');
    return;
  }
  const fs = require('node:fs');
  const err = JSON.parse(fs.readFileSync(file, 'utf8'));
  const decoded = decodeTransactionError(err);
  console.log(JSON.stringify(decoded, null, 2));
}

function runParseLogs(args) {
  const file = args[0];
  if (!file) {
    console.log('Need a path to a logs file');
    return;
  }
  const fs = require('node:fs');
  const logs = fs.readFileSync(file, 'utf8').split('\n').filter(l => l.trim());
  const parsed = parseLogs(logs);
  const trace = traceInstructions(parsed);
  console.log('Trace:');
  console.log(JSON.stringify(trace, null, 2));
}

function runDemo() {
  console.log('=== Anchor Debug Demo ===\n');

  console.log('1. Decoding common Anchor error codes:\n');
  for (const code of [100, 150, 153, 154, 200, 300, 6000, 9999]) {
    const d = decodeError(code);
    console.log(`  ${code}: ${d.name}`);
    console.log(`    ${d.msg}`);
    console.log(`    Fix: ${d.fix}\n`);
  }

  console.log('2. Decoding a transaction error:\n');
  const txErr = {
    err: {
      InstructionError: [2, 6001],
    },
  };
  console.log(JSON.stringify(decodeTransactionError(txErr), null, 2));
  console.log();

  console.log('3. Parsing program logs:\n');
  const sampleLogs = [
    'Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA invoke [1]',
    'Program log: Instruction: Transfer',
    'Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA consumed 4500 of 200000 compute units',
    'Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA success',
  ];
  const parsed = parseLogs(sampleLogs);
  console.log(`Parsed ${parsed.length} log entries:`);
  for (const entry of parsed) {
    console.log(`  [${entry.type}] ${entry.message || entry.programId || entry.raw.slice(0, 60)}`);
  }
  console.log();
  console.log('=== Demo complete ===');
}

main();